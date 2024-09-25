import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

interface Placeholder {
    [key: string]: string;
  }
  
  interface Product {
    name: string;
    template: string;
    placeholders: Placeholder;
  }
  
  interface Company {
    name: string;
    website: string;
    email: string;
    products: Product[];
  }
  
  interface Config {
    [vendor: string]: {
      [company: string]: Company;
    };
  }

  abstract class TransformationStep {
    abstract transform(content: string, context: any): Promise<string>;
}

class PlaceholderReplacement extends TransformationStep {
    async transform(content: string, context: { companyConfig: Company, product: Product }): Promise<string> {
        const placeholders: { [key: string]: string } = {
            COMPANY_NAME: context.companyConfig.name,
            COMPANY_WEBSITE: context.companyConfig.website,
            COMPANY_EMAIL: context.companyConfig.email,
            PRODUCT_NAME: context.product.name,
            ...context.product.placeholders
        };
        return content.replace(/\{\{(\w+)\}\}/g, (match, placeholder) => {
            return placeholders[placeholder] || match;
        });
    }
}

class DocumentProcessor {
    private steps: TransformationStep[] = [];

    addStep(step: TransformationStep) {
        this.steps.push(step);
    }

    async process(content: string, context: any): Promise<string> {
        for (const step of this.steps) {
            content = await step.transform(content, context);
        }
        return content;
    }
}

async function generateDocs() {
    const config = yaml.load(await fs.readFile('config/companies.yaml', 'utf8')) as Config;
    const vendor = process.env.VENDOR;
    const company = process.env.COMPANY;

    if (!vendor || !company) {
        console.error('VENDOR and COMPANY environment variables must be set');
        process.exit(1);
    }

    const companyConfig = config[vendor]?.[company];
    if (!companyConfig) {
        console.error(`Configuration not found for vendor ${vendor} and company ${company}`);
        process.exit(1);
    }

    const docsDir = path.join('docs', vendor, company.toLowerCase());
    await fs.ensureDir(docsDir);

    const sidebarItems = [];

    // Create and configure the document processor
    const processor = new DocumentProcessor();
    processor.addStep(new PlaceholderReplacement());

    for (const product of companyConfig.products) {
        const templateContent = await fs.readFile(`templates/${product.template}`, 'utf8');
        const filledContent = await processor.process(templateContent, { companyConfig, product });

        const fileName = `${path.parse(product.template).name.toLowerCase().replace(/ /g, '-')}.mdx`;
        const outputPath = path.join(docsDir, fileName);
        await fs.outputFile(outputPath, filledContent);
        console.log(`Generated: ${outputPath}`);

        sidebarItems.push(`${vendor}/${company.toLowerCase()}/${fileName.replace('.mdx', '')}`);
    }

    // Generate sidebar configuration file
    const sidebarConfig = {
        [`${vendor}${company}Sidebar`]: sidebarItems,
    };

    const sidebarPath = path.join('sidebars', `${vendor}-${company}.ts`);
    await fs.outputFile(
        sidebarPath,
        `module.exports = ${JSON.stringify(sidebarConfig, null, 2)};`
    );
    console.log(`Generated sidebar configuration: ${sidebarPath}`);

    // Create an empty custom.css file if it doesn't exist
    const customCssDir = path.join('src', 'css', vendor, company.toLowerCase());
    const customCssPath = path.join(customCssDir, 'custom.css');
    await fs.ensureDir(customCssDir);
    if (!await fs.pathExists(customCssPath)) {
        await fs.writeFile(customCssPath, '/* Custom styles */\n');
        console.log(`Created empty custom CSS: ${customCssPath}`);
    }
}

generateDocs().catch(console.error);