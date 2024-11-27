import { Anthropic } from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { ExternalDocRequest, Config, Product } from './types';
import { TemplateGenerator } from './createTemplates';
import { getTransformation } from './transformations/registry';

async function processExternalDoc(request: ExternalDocRequest): Promise<string> {
    const configPath = 'config/companies.yaml';
    let config: Config = {};
    // Read existing config
    if (await fs.pathExists(configPath)) {
        const configContent = await fs.readFile(configPath, 'utf8');
        config = yaml.load(configContent) as Config;
    }

    // Ensure vendor and company exist
    if (!config[request.vendor]) {
        config[request.vendor] = {};
    }
    if (!config[request.vendor][request.company]) {
        config[request.vendor][request.company] = {
            name: request.company,
            website: '',
            email: '',
            products: []
        };
    }
    if (request.isDirectory) {
        const sourceDir = request.sourcePath;
        
        const getAllFiles = async (dir: string): Promise<string[]> => {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(dirents.map(async (dirent) => {
                const res = path.join(dir, dirent.name);
                return dirent.isDirectory() ? getAllFiles(res) : res;
            }));
            return files.flat();
        };
        
        const allFiles = await getAllFiles(sourceDir);
        
        for (const file of allFiles) {
            const fullPath = file;
            const stats = await fs.stat(fullPath);
            
            if (stats.isFile() && (file.endsWith('.md') || file.endsWith('.mdx') || file.endsWith('.cjs'))) {
                const relPath = path.relative(sourceDir, fullPath);
                const targetDir = path.join('docs', request.vendor, request.company, path.dirname(relPath));
                await fs.ensureDir(targetDir);
                await fs.copyFile(fullPath, path.join(targetDir, path.basename(file)));
                console.log('Copied file:', fullPath, 'to', path.join(targetDir, path.basename(file)));
            }
        }
        return JSON.stringify({ success: true });
    }
    let sourceContent: string;
    try {
        sourceContent = await fs.readFile(request.sourcePath, 'utf8');
    } catch (error: unknown) {
        return JSON.stringify({ 
            success: false, 
            error: `Failed to read source file: ${(error as Error).message}` 
        });
    }
    // Create product entry
    const productName = path.basename(request.sourcePath, path.extname(request.sourcePath));
    const newProduct: Product = {
        name: productName,
        source: request.sourcePath,
        transformations: request.transformations.map(t => ({
            name: t.type,
            config: t.config || {}
        }))
    };

    // Check if document needs templatization
    if (request.transformations.some(t => t.type === 'templatize')) {
        const templateName = `templatized-${path.basename(request.sourcePath)}`;
        newProduct.template = templateName;

        const products = config[request.vendor][request.company].products;
        const existingIndex = products.findIndex(p => p.source === newProduct.source);
        if (existingIndex >= 0) {
            products[existingIndex] = newProduct;
        } else {
            products.push(newProduct);
        }
    
        // Save updated config
        await fs.writeFile(configPath, yaml.dump(config, { indent: 2 }));
        // Create template using Anthropic API
        const apiKey = process.env.ANTHROPIC_API_KEY || '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';
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable must be set');
        }

        const generator = new TemplateGenerator(apiKey, configPath);
        await generator.initialize();

        // Create temp file for processing
        const tempDir = path.join('input-docs', 'temp');
        await fs.ensureDir(tempDir);
        const tempFile = path.join(tempDir, path.basename(request.sourcePath));
        
        try {
            await fs.writeFile(tempFile, sourceContent);
            await generator.createTemplate(
                tempFile,
                request.vendor,
                request.company,
                config[request.vendor][request.company]
            );
        } catch (templateError: unknown) {
            console.error('Template generation failed:', templateError);
            throw new Error(`Failed to generate template: ${(templateError as Error).message}`);
        } finally {
            await fs.remove(tempDir);
        }
    } else {
        // For non-templated docs, store original content
        const docsDir = path.join('input-docs', request.vendor, request.company);
        await fs.ensureDir(docsDir);
        const outputFilename = path.basename(request.sourcePath, path.extname(request.sourcePath)) + '.mdx';
        const outputPath = path.join(docsDir, outputFilename);

        // Apply proofread transformation if requested
        const proofreadTransformation = request.transformations.find(t => t.type === 'proofread');
        if (proofreadTransformation) {
            const transformer = getTransformation('proofread', proofreadTransformation.config);
            if (transformer) {
                try {
                    const result = await transformer.transform(sourceContent);
                    sourceContent = result.content;
                    console.log('Proofread content:', sourceContent);
                    console.log('Output path:', outputPath);
                    // Save the proofread content
                    await fs.writeFile(outputPath, sourceContent, 'utf8');
                } catch (error: unknown) {
                    return JSON.stringify({
                        success: false,
                        error: `Proofreading failed: ${(error as Error).message}`
                    });
                }
            }
        } else if (request.transformations.some(t => t.type === 'validate-links')) {
            const validateLinkTransformation = request.transformations.find(t => t.type === 'validate-links');
            const transformer = getTransformation('validate-links', validateLinkTransformation?.config);
            if (transformer) {
                try {
                    const result = await transformer.transform(sourceContent);
                    const err: string[] = result.errors || [];
                    if (err.length > 0) {
                        throw new Error(err.join(', '));
                    }
                    sourceContent = result.content;
                    console.log('Output path:', outputPath);
                    // Save the proofread content
                    await fs.writeFile(outputPath, sourceContent, 'utf8');
                } catch (error: unknown) {
                    return JSON.stringify({
                        success: false,
                        error: `Validate link failed: ${(error as Error).message}`
                    });
                }
            }
        } else {
            await fs.writeFile(
                path.join(docsDir, path.basename(request.sourcePath)),
                sourceContent
            );
        }
    }

    // Update or add product in config
    // const products = config[request.vendor][request.company].products;
    // const existingIndex = products.findIndex(p => p.source === newProduct.source);
    // if (existingIndex >= 0) {
    //     products[existingIndex] = newProduct;
    // } else {
    //     products.push(newProduct);
    // }

    // // Save updated config
    // await fs.writeFile(configPath, yaml.dump(config, { indent: 2 }));

    return JSON.stringify({ success: true });
}

// CLI interface
if (require.main === module) {
    const request: ExternalDocRequest = JSON.parse(process.argv[2]);
    processExternalDoc(request)
        .then(result => {
            console.log(result);
        })
        .catch(error => {
            console.error(JSON.stringify({ success: false, error: error.message }));
            process.exit(1);
        });
}

export { processExternalDoc };