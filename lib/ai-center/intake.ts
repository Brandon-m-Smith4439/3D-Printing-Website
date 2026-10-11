import {z} from 'zod';
export const intakeOutputFormat={type:'json_schema',json_schema:{name:'owner_intake_draft',strict:true,schema:{type:'object',additionalProperties:false,required:['name','description','quantity','stage'],properties:{name:{type:'string'},description:{type:'string'},quantity:{type:'integer'},stage:{type:'string',enum:['on-hold','new','reviewing','preparing','printing','finishing','ready']}}}}};
export const intakeInstruction='For this in-person intake, return only the required JSON draft. Put uncertainties and questions in description. Do not invent payment or customer contact details. Use on-hold for maybe projects, reviewing if the stage is unclear, and quantity 1 when unspecified. The owner reviews and edits it before saving.';
export const intakeSchema=z.object({name:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(2500),quantity:z.number().int().min(1).max(500),stage:z.enum(['on-hold','new','reviewing','preparing','printing','finishing','ready'])}).strict();
export type IntakeDraft=z.infer<typeof intakeSchema>;
export function parseIntakeDraft(text:string):IntakeDraft {
  const value=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  return intakeSchema.parse(JSON.parse(value));
}
