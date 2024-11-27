import { Anthropic } from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { Config, Company } from './types';

export class TemplateGenerator {
    private client: Anthropic;
    private config!: Config;
    private configPath: string;

    constructor(apiKey: string, configPath: string) {
        this.client = new Anthropic({
            apiKey: apiKey
        });
        this.configPath = configPath;
    }

    async initialize(): Promise<void> {
        if (await fs.pathExists(this.configPath)) {
            const configContent = await fs.readFile(this.configPath, 'utf8');
            this.config = yaml.load(configContent) as Config;
        } else {
            this.config = {};
        }
    }

    async createTemplate(
        inputPath: string,
        vendor: string,
        company: string,
        companyConfig: Company
    ): Promise<void> {
        try {
            const content = await fs.readFile(inputPath, 'utf8');
            const templateName = `templatized-${path.basename(inputPath)}`;

            const systemMessage = `Analyze this document and:
1. Create a templatized version by replacing specific values with placeholders
2. Identify the original values and their corresponding placeholders
3. Return the result in this JSON format:
{
    "templatedContent": "... content with {{PLACEHOLDER}} syntax ...",
    "placeholders": {
        "PLACEHOLDER_NAME": "original value"
    }
}

Important: Please ensure all newlines in the templatedContent are escaped as \\n and the response is valid JSON.

Guidelines for placeholders:
- Use SNAKE_CASE for placeholder names
- Common values should use standardized placeholders: COMPANY_NAME, COMPANY_WEBSITE, COMPANY_EMAIL
- Identify specific values like UUIDs, API endpoints, tokens, etc.
- Include any repeated values that might need to be replaced
- Use semantic names that describe what the value represents`;

            const response = await this.client.messages.create({
                model: 'claude-3-sonnet-20240229',
                messages: [
                    { role: 'user', content: systemMessage },
                    {
                        role: 'user',
                        content: content
                    }
                ],
                max_tokens: 4096,
            });
            const responseContent = response.content[0].type === 'text' 
                ? response.content[0].text 
                : '';

            if (!responseContent) {
                throw new Error('No response content received from Claude');
            }
            const result = JSON.parse(responseContent);

            // Save template
            const templateDir = path.join('templates');
            await fs.ensureDir(templateDir);
            await fs.writeFile(
                path.join(templateDir, templateName),
                result.templatedContent
            );

            // Update config
            if (!this.config[vendor]) {
                this.config[vendor] = {};
            }
            if (!this.config[vendor][company]) {
                this.config[vendor][company] = companyConfig;
            }

            // Find the product entry and update its placeholders
            const product = this.config[vendor][company].products.find(
                p => p.template === templateName
            );
            //console.log("PRODUCT", product, result.placeholders)
            if (product) {
                product.placeholders = result.placeholders;
            }
            //console.log("PRODUCT", product);
            
            await this.saveConfig();
            console.log(`Created template: ${templateName}`);
        } catch (error) {
            console.error(`Error creating template for ${inputPath}:`, error);
            throw error;
        }
    }

    private async saveConfig(): Promise<void> {
        await fs.writeFile(
            this.configPath,
            yaml.dump(this.config, { indent: 2, lineWidth: -1 })
        );
    }

    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: { [key: string]: string } = {
            '.md': 'text/markdown',
            '.mdx': 'text/markdown',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain'
        };
        return contentTypes[ext] || 'text/plain';
    }
}

// CLI interface for standalone usage
if (require.main === module) {
    const action = process.argv[2];
    if (action === 'create-templates') {
        const inputDir = process.argv[3] || 'input-docs';
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const vendor = process.env.VENDOR || 'LivelyVideo';
        const company = process.env.COMPANY || 'lively';

        if (!apiKey || !vendor || !company) {
            console.error('ANTHROPIC_API_KEY, VENDOR, and COMPANY environment variables must be set');
            process.exit(1);
        }

        const generator = new TemplateGenerator(apiKey, 'config/companies.yaml');
        generator.initialize()
            .then(() => {
                // Process all files in input directory
                fs.readdir(inputDir)
                    .then(files => {
                        const mdxFiles = files.filter(file => file.endsWith('.mdx'));
                        return Promise.all(mdxFiles.map(file => 
                            generator.createTemplate(
                                path.join(inputDir, file),
                                vendor,
                                company,
                                {
                                    name: company,
                                    website: process.env.COMPANY_WEBSITE || '',
                                    email: process.env.COMPANY_EMAIL || '',
                                    products: []
                                }
                            )
                        ));
                    })
                    .catch(console.error);
            })
            .catch(console.error);
    } else {
        console.error('Please specify action: create-templates');
        process.exit(1);
    }
}
