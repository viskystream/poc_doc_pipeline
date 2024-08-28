import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebarsVendor1: SidebarsConfig = {
    vendor1Sidebar: [
        'intro',
        {
            type: 'category',
            label: 'Products',
            items: ['product1', 'product2'],
        },
    ],
};

export default sidebarsVendor1;