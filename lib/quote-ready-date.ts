export function automaticReadyDate(machineHours:number,queueBoundaryDate:string,now=new Date()){
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const boundary=/^\d{4}-\d{2}-\d{2}$/.test(queueBoundaryDate)
    ? Date.parse(`${queueBoundaryDate}T00:00:00.000Z`)
    : Number.NaN;
  const start=Number.isFinite(boundary)?Math.max(today,boundary):today;
  const printDays=machineHours>0?Math.max(1,Math.ceil(machineHours/24)):0;
  return new Date(start+(printDays+3)*86_400_000).toISOString().slice(0,10);
}
