import {z} from 'zod';
export const intakeSchema=z.object({name:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(2500),quantity:z.number().int().min(1).max(500),stage:z.enum(['on-hold','new','reviewing','preparing','printing','finishing','ready'])}).strict();
export type IntakeDraft=z.infer<typeof intakeSchema>;
export function parseIntakeDraft(text:string):IntakeDraft {
  const value=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  return intakeSchema.parse(JSON.parse(value));
}
