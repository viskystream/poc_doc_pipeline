import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

interface Product {
    name: string;
    template: string;
}

interface Company {
    name: string;
    website: string;
    email: string;
    products: Product[];
}

interface VendorConfig {
    [company: string]: Company;
}

interface Config {
    [vendor: string]: VendorConfig;
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

    for (const product of companyConfig.products) {
        const templateContent = await fs.readFile(`templates/${product.template}`, 'utf8');
        const filledContent = templateContent
            .replace(/\{\{COMPANY_NAME\}\}/g, companyConfig.name)
            .replace(/\{\{COMPANY_WEBSITE\}\}/g, companyConfig.website)
            .replace(/\{\{COMPANY_EMAIL\}\}/g, companyConfig.email)
            .replace(/\{\{PRODUCT_NAME\}\}/g, product.name);

        const fileName = `${product.name.toLowerCase().replace(/ /g, '-')}.mdx`;
        const outputPath = path.join(docsDir, fileName);
        await fs.outputFile(outputPath, filledContent);
        console.log(`Generated: ${outputPath}`);

        // Add to sidebar items with full path
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