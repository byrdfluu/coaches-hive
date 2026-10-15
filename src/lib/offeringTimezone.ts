export const OFFERING_TIMEZONES=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','UTC']

export function zonedLocalToIso(date:string,time:string,timeZone:string){
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number)
  if(!year||!month||!day||!Number.isInteger(hour)||!Number.isInteger(minute))throw new Error('Invalid local date or time')
  let utc=Date.UTC(year,month-1,day,hour,minute)
  for(let i=0;i<3;i++){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc))
    const value=(type:string)=>Number(parts.find(part=>part.type===type)?.value)
    const represented=Date.UTC(value('year'),value('month')-1,value('day'),value('hour'),value('minute'))
    utc+=Date.UTC(year,month-1,day,hour,minute)-represented
  }
  return new Date(utc).toISOString()
}

export function dateInTimezone(value:string,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value))
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const formatOfferingDateTime=(value:string,timeZone:string,options:Intl.DateTimeFormatOptions={})=>
  new Intl.DateTimeFormat('en-US',{timeZone,dateStyle:'medium',timeStyle:'short',...options}).format(new Date(value))
