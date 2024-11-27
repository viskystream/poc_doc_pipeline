import { Anthropic } from '@anthropic-ai/sdk';
import { TransformationResult } from '../types';

export abstract class Transformation {
    constructor(protected config: Record<string, any> = {}) {}
    abstract transform(content: string): Promise<TransformationResult>;
}

export class ProofreadTransformation extends Transformation {
    async transform(content: string): Promise<TransformationResult> {
        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

        const response = await anthropic.messages.create({
            model: this.config.model || 'claude-3-sonnet-20240229',
            messages: [
                {
                    role: 'user',
                    content: `Proofread and improve this technical documentation by returning the content with the updates and please do not include anything outside the content on the document in the response, maintaining its technical accuracy and ${this.config.style || 'technical'} style:\n\n${content}`
                }
            ],
            max_tokens: 4096,
        });
        const responseContent = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
        return { 
            content: responseContent
        };
    }
}

export class LinkValidationTransformation extends Transformation {
    async transform(content: string): Promise<TransformationResult> {
        const errors: string[] = [];
        const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;

        while ((match = linkPattern.exec(content)) !== null) {
            const [, text, url] = match;
            if (this.config.checkExternal && url.startsWith('http')) {
                try {
                    const response = await fetch(url);
                    if (response.status >= 400) {
                        errors.push(`Broken link: ${url}`);
                    }
                } catch (error) {
                    errors.push(`Failed to check link: ${url}`);
                }
            }
        }

        return {
            content,
            errors
        };
    }
}

export class InternalContentTransformation extends Transformation {
    async transform(content: string): Promise<TransformationResult> {
        const isInternal = process.env.GENERATE_INTERNAL === 'true';
        let processedContent = content;

        if (!isInternal) {
            processedContent = content.replace(
                /<!--\s*internal-content-start\s*-->[\s\S]*?<!--\s*internal-content-end\s*-->/g,
                ''
            );
        }

        return { content: processedContent };
    }
}