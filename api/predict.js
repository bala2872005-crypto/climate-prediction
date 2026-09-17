import { db, ai } from "hatchable";

export const access = "user";
export const methods = ["POST"];

const CITIES = {
  Hyderabad: [17.385, 78.4867], Chennai: [13.0827, 80.2707], Bengaluru: [12.9716, 77.5946],
  Mumbai: [19.076, 72.8777], Delhi: [28.6139, 77.209], Kolkata: [22.5726, 88.3639],
  London: [51.5074, -0.1278], NewYork: [40.7128, -74.006], Singapore: [1.3521, 103.8198]
};

function regression(values) {
  const n = values.length; if (!n) return { slope: 0, last: 0 };
  let sx=0, sy=0, sxy=0, sx2=0;
  for(let i=0;i<n;i++){ sx+=i; sy+=values[i]; sxy+=i*values[i]; sx2+=i*i; }
  const slope=(n*sxy-sx*sy)/Math.max(1,n*sx2-sx*sx);
  return { slope, last: values[n-1] };
}

export default async function(req,res){
  const body=req.body||{}; const location=String(body.location||"Hyderabad");
  const horizon=Math.min(12,Math.max(3,Number(body.horizon||6)));
  const coords=CITIES[location]||CITIES.Hyderabad;
  const end=new Date(); const start=new Date(end); start.setFullYear(end.getFullYear()-10);
  const iso=d=>d.toISOString().slice(0,10);
  const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${coords[0]}&longitude=${coords[1]}&start_date=${iso(start)}&end_date=${iso(end)}&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;
  let data;
  try { const r=await fetch(url); if(!r.ok) throw new Error("Historical climate data unavailable"); data=await r.json(); }
  catch(e){ return res.status(502).json({error:"Could not load historical climate data. Please try again."}); }
  const temps=data.daily?.temperature_2m_mean||[], rain=data.daily?.precipitation_sum||[];
  if(temps.length<365) return res.status(502).json({error:"Not enough historical data for this location."});
  const monthly=[];
  for(let m=0;m<12;m++){
    const tv=[],rv=[];
    for(let i=0;i<data.daily.time.length;i++){ const month=Number(data.daily.time[i].slice(5,7))-1; if(month===m&&Number.isFinite(temps[i])){tv.push(temps[i]);rv.push(rain[i]||0);} }
    monthly.push({month:m+1,temp:tv.reduce((a,b)=>a+b,0)/Math.max(1,tv.length),rain:rv.reduce((a,b)=>a+b,0)/Math.max(1,rv.length)});
  }
  const recent=temps.slice(-365); const recentRain=rain.slice(-365);
  const baseline=temps.slice(0,-365); const baseAvg=baseline.reduce((a,b)=>a+b,0)/baseline.length;
  const recentAvg=recent.reduce((a,b)=>a+b,0)/recent.length;
  const tempTrend=regression(temps.slice(-1825));
  const predictedChange=tempTrend.slope*30*horizon;
  const rainAvg=recentRain.reduce((a,b)=>a+b,0)/recentRain.length;
  const change=recentAvg-baseAvg;
  const confidence=Math.max(55,Math.min(91,82-Math.abs(tempTrend.slope)*1200));
  const aiPrompt=`You are a climate-data explainer. Do not claim certainty. Based only on these calculated historical statistics for ${location}: 10-year daily observations; recent 365-day average temperature ${recentAvg.toFixed(2)} C; earlier-period average ${baseAvg.toFixed(2)} C; recent-vs-earlier difference ${change.toFixed(2)} C; recent daily precipitation average ${rainAvg.toFixed(2)} mm; linear trend over recent 5 years ${tempTrend.slope.toFixed(5)} C/day; simple ${horizon}-month extrapolated temperature change ${predictedChange.toFixed(2)} C. Give a concise plain-English summary, 2 key drivers visible in the data, and one practical caution. Clearly call it a statistical projection, not a weather forecast. Return JSON with summary, drivers array, caution.`;
  let insight={summary:"Historical trend suggests a gradual change, but this is a statistical projection rather than a weather forecast.",drivers:["Recent temperature differs from the longer historical baseline.","The recent multi-year trend influences the projection."],caution:"Climate projections contain uncertainty and should not be used as an emergency weather warning."};
  try{const out=await ai.generateText({model:"sonnet",prompt:aiPrompt,purpose:"climate-explanation"}); const text=out.text||out; const match=String(text).match(/\{[\s\S]*\}/); if(match) insight={...insight,...JSON.parse(match[0])};}catch(e){}
  const summary=insight.summary;
  await db.query("INSERT INTO predictions (user_id, location, horizon_months, avg_temperature, temperature_change, avg_precipitation, confidence, summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[req.user.id,location,horizon,recentAvg,predictedChange,rainAvg,confidence,summary]);
  res.json({location,horizon,historyYears:10,recentAverage:recentAvg,baselineAverage:baseAvg,temperatureChange:predictedChange,baselineDifference:change,precipitation:rainAvg,confidence,monthly:monthly.slice(0,horizon),insight});
}