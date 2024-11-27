import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { Config, Company, Product } from './types';
import { getTransformation } from './transformations/registry';

async function generateDocs() {
    const config = yaml.load(await fs.readFile('config/companies.yaml', 'utf8')) as Config;
    
    for (const [vendor, vendorConfig] of Object.entries(config)) {
        for (const [company, companyConfig] of Object.entries(vendorConfig)) {
            const docsDir = path.join('docs', vendor, company.toLowerCase());
            await fs.ensureDir(docsDir);
            
            // Build nested sidebar structure
            const sidebarCategory = {
                type: 'category',
                label: company,
                items: [] as any[]
            };
            
            const filesByFolder: { [key: string]: any[] } = { '.': [] };

            for (const product of companyConfig.products) {
                let content: string;
                let outputPath: string;
                const warnings: string[] = [];
                const errors: string[] = [];
                
                try {
                    if (product.template) {
                        // Handle templated content
                        content = await fs.readFile(
                            path.join('templates', product.template),
                            'utf8'
                        );
                        content = await processTemplatedContent(content, companyConfig, product);
                        outputPath = path.join(docsDir, product.template);
                    } else {
                        if (!product.source) {
                            throw new Error(`No source specified for product ${product.name}`);
                        }
                        // Handle non-templated content
                        content = await fs.readFile(
                            path.join('input-docs', vendor, company, path.basename(product.source)),
                            'utf8'
                        );
                        const result = await processNonTemplatedContent(content, product);
                        content = result.content;
                        if (result.warnings) warnings.push(...result.warnings);
                        if (result.errors) errors.push(...result.errors);
                        outputPath = path.join(docsDir, path.basename(product.source));
                    }

                    // Apply internal content filter to all content
                    const internalTransform = getTransformation('internal-content');
                    if (internalTransform) {
                        const result = await internalTransform.transform(content);
                        content = result.content;
                    }

                    // Write to Docusaurus structure
                    await fs.outputFile(outputPath, content);

                    // Log any issues
                    if (warnings.length > 0) {
                        console.warn(`Warnings for ${product.name}:`, warnings);
                    }
                    if (errors.length > 0) {
                        console.error(`Errors for ${product.name}:`, errors);
                    }

                } catch (error) {
                    console.error(`Error processing ${product.name}:`, error);
                }
            }
            // Build sidebar structure by walking through the docs directory
            const getAllFiles = async (dir: string): Promise<string[]> => {
                const dirents = await fs.readdir(dir, { withFileTypes: true });
                const files = await Promise.all(dirents.map(async (dirent) => {
                    const res = path.join(dir, dirent.name);
                    return dirent.isDirectory() ? getAllFiles(res) : res;
                }));
                return files.flat();
            };
            
            const allFiles = await getAllFiles(docsDir);
            
            for (const file of allFiles) {
                if (file.endsWith('.md') || file.endsWith('.mdx')) {
                    const relPath = path.relative(docsDir, file);
                    const dirName = path.dirname(relPath);
                    console.log('Processing file:', file, 'in directory:', dirName, 'relative path:', relPath, 'docsDir:', docsDir);
                    const docId = `${vendor}/${company.toLowerCase()}/${relPath.replace(/\.[^/.]+$/, '')}`;
                    
                    if (dirName !== '.') {
                        if (!filesByFolder[dirName]) {
                            filesByFolder[dirName] = [];
                        }
                        filesByFolder[dirName].push(docId);
                    } else {
                        filesByFolder['.'].push(docId);
                    }
                }
            }
            // Build nested sidebar structure
            for (const [folder, files] of Object.entries(filesByFolder)) {
                if (folder === '.') {
                    sidebarCategory.items.push(...files);
                } else {
                    sidebarCategory.items.push({
                        type: 'category',
                        label: folder,
                        items: files
                    });
                }
            }
            // Generate sidebar configuration
            const sidebarConfig = {
                [`${vendor}${company}Sidebar`]: [sidebarCategory]
            };

            const sidebarPath = path.join('sidebars', `${vendor}-${company}.ts`);
            console.log(`Attempting to write sidebar file to: ${sidebarPath}`);
            try {
                await fs.outputFile(
                    sidebarPath,
                    `module.exports = ${JSON.stringify(sidebarConfig, null, 2)};`
                );
                console.log(`Successfully wrote sidebar file to: ${sidebarPath}`);
            } catch (error) {
                console.error(`Failed to write sidebar file: ${error}`);
                throw error; // Re-throw to be caught by outer try-catch
            }
        }
    }
}

async function processTemplatedContent(
    content: string,
    companyConfig: Company,
    product: Product
): Promise<string> {
    let processedContent = content;

    // Replace placeholders
    if (product.placeholders) {
        for (const [key, value] of Object.entries(product.placeholders)) {
            const placeholder = `{{${key}}}`;
            processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
        }
    }

    return processedContent;
}

async function processNonTemplatedContent(
    content: string,
    product: Product
): Promise<{ content: string; warnings?: string[]; errors?: string[] }> {
    let processedContent = content;
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!product.transformations) {
        return { content: processedContent };
    }

    // Apply each transformation in sequence
    for (const transform of product.transformations) {
        const transformer = getTransformation(transform.name, transform.config);
        if (transformer) {
            const result = await transformer.transform(processedContent);
            processedContent = result.content;
            if (result.warnings) warnings.push(...result.warnings);
            if (result.errors) errors.push(...result.errors);
        }
    }

    return {
        content: processedContent,
        warnings,
        errors
    };
}

// CLI interface
if (require.main === module) {
    generateDocs()
        .then(() => {
            console.log('Documentation generation completed successfully');
        })
        .catch(error => {
            console.error('Error generating documentation:', error);
            process.exit(1);
        });
}

export { generateDocs };