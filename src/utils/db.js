import he from "he";
import { normalizeText } from "./data";

// ! WHEN THE DB MIGRATION IS FINISHED, THIS WILL WORK. FOR NOW, WE WILL USE THE WORDPRESS REST API

// import mysql from "mysql2/promise";

// const pool = mysql.createPool({
//   host: "10.248.42.122",
//   user: "triangle_service",
//   password: "triangle_pw",
//   database: "triangle_db",
// });

// export async function callProcedure(procName, params = []) {
//   const [results] = await pool.query(`CALL ${procName}(${params.map(() => "?").join(",")})`, params);
//   return results[0]; // Stored procedures return an array of results
// }

export async function callProcedure(procName, params = []) {
  if (procName === 'get_articles_by_section') {
    const results = await articles_by_section(params[0], params[1], params[2]);
    return results;
  }
}

async function articles_by_section(section, limit, offset) {
  const section_mapping = {
    "news": 3,
    "sports": 8,
    "opinion": 9,
    "entertainment": 10,
    "comics": 506
  }
  const url = "https://thetriangle.org/wp-json/wp/v2/posts/?categories="+section_mapping[section]+"&per_page="+limit+"&offset="+offset;
  console.log(url)
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ERROR STATUS: ${response.status}`);
    }

    const processed = []
    const data = await response.json();

    data.forEach(datum => {
      const rawTitle = he.decode(datum["title"]["rendered"]).replace(/<[^>]*>/g, "");
      const rawExcerpt = he.decode(datum["excerpt"]["rendered"]).replace(/<[^>]*>/g, "");
      processed.push({
        "title": normalizeText(rawTitle),
        "excerpt": normalizeText(rawExcerpt)
      });
    });
    return processed; 

  } catch (error) {
    console.error('ERROR:', error);
  }
}