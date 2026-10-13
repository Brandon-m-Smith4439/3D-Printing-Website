export function matchesShipmentTracker(item:{trackerId:string;trackingCode:string},trackerId:string,trackingCode:string):boolean{
  if(trackerId&&item.trackerId)return item.trackerId===trackerId;
  return Boolean(trackingCode&&item.trackingCode===trackingCode);
}
