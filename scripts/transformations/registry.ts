import { 
    Transformation,
    ProofreadTransformation,
    LinkValidationTransformation,
    InternalContentTransformation
} from './index';

export const transformationRegistry: Record<string, new (config?: Record<string, any>) => Transformation> = {
    'proofread': ProofreadTransformation,
    'validate-links': LinkValidationTransformation,
    'internal-content': InternalContentTransformation
};

export function getTransformation(name: string, config?: Record<string, any>): Transformation | null {
    const TransformClass = transformationRegistry[name];
    if (!TransformClass) {
        console.warn(`Transformation ${name} not found`);
        return null;
    }
    return new TransformClass(config);
}