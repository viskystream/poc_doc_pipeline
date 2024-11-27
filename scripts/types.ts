import { Anthropic } from '@anthropic-ai/sdk';

export interface Placeholder {
    [key: string]: string;
}

export interface Transformation {
    name: string;
    config?: Record<string, any>;
}

export interface Product {
    name: string;
    template?: string;
    source?: string;
    placeholders?: Placeholder;
    transformations?: Transformation[];
}

export interface Company {
    name: string;
    website: string;
    email: string;
    products: Product[];
}

export interface Config {
    [vendor: string]: {
        [company: string]: Company;
    };
}

export interface TransformationResult {
    content: string;
    warnings?: string[];
    errors?: string[];
}

export interface ProcessContext {
    companyConfig: Company;
    product: Product;
    isInternal: boolean;
}

export interface ExternalDocRequest {
    sourcePath: string;
    vendor: string;
    company: string;
    isDirectory?: boolean;
    transformations: Array<{
        type: string;
        config?: Record<string, any>;
    }>;
}