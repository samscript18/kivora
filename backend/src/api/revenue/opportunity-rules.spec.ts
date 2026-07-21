import{opportunityRuleEligible}from"./opportunity-rules";
describe("deterministic opportunity rules",()=>{it.each([
["market_demand_acceleration",{marketAcceleration:.08,marketGap:.12}],
["booking_pace_divergence",{paceDays:3,marketGap:.1}],
["comparable_price_movement",{compDays:3}],
["weekday_occupancy",{weekdayDays:3,marketGap:.01}],
["weekend_pricing_premium",{weekendDays:2}],
["last_minute_demand",{lastMinuteDays:2}],
["far_future_demand",{farFutureDays:3}],
["luxury_listing_premium",{luxuryProfile:true,highCompDays:3}],
["minimum_stay_optimization",{calendarCurrent:true,minimumStay:2,gapDays:1}],
["gap_night_optimization",{calendarCurrent:true,minimumStay:3,gapDays:2}],
["seasonal_demand",{historyPoints:4,seasonalLift:.1,seasonalDemandDays:4}],
])("requires sufficient evidence for %s",(type,input)=>{expect(opportunityRuleEligible(type,input)).toBe(true);expect(opportunityRuleEligible(type,{})).toBe(false);});});
