// models/UserProfile.js
export default class UserProfile {
  constructor({ name, age, income, job, location, riskTolerance, investmentHorizon, preferences }) {
    this.id = Date.now().toString(); // simple unique ID
    this.name = name;
    this.age = age;
    this.income = income;
    this.job = job;
    this.location = location;
    this.riskTolerance = riskTolerance;
    this.investmentHorizon = investmentHorizon;
    this.preferences = preferences || [];
  }
}
