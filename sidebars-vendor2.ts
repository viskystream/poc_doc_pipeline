import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebarsVendor2: SidebarsConfig = {
    vendor2Sidebar: [
        'intro',
        {
            type: 'category',
            label: 'Services',
            items: ['service1', 'service2'],
        },
    ],
};

export default sidebarsVendor2;