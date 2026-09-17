import { db } from "hatchable";
export const access = "user";
export const methods = ["GET"];
export default async function(req,res){
 const {rows}=await db.query("SELECT id, location, horizon_months, avg_temperature, temperature_change, avg_precipitation, confidence, summary, created_at FROM predictions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 12",[req.user.id]);
 res.json(rows);
}