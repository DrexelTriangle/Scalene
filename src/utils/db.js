import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "10.248.42.122",
  user: "triangle_service",
  password: "triangle_pw",
  database: "triangle_db",
});

export async function callProcedure(procName, params = []) {
  const [results] = await pool.query(`CALL ${procName}(${params.map(() => "?").join(",")})`, params);
  return results[0]; // Stored procedures return an array of results
}