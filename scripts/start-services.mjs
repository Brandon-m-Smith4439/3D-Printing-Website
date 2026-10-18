import {servicePlan} from './service-plan.mjs';
import {supervise} from './service-supervisor.mjs';
const {done}=supervise(servicePlan(process.env,process.argv.slice(2)));
process.exitCode=await done;
