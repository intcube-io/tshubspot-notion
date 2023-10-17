import { Client as NotionClient } from "@notionhq/client";
import { Client as HubspotClient } from "@hubspot/api-client";

import dotenv from "dotenv";

dotenv.config();

async function main() {
  const notion = new NotionClient({
    auth: process.env.NOTION_TOKEN,
  });
  const hubspot = new HubspotClient({
    accessToken: process.env.HUBSPOT_API_KEY,
  });

  const notionProjectDb = await notion.databases.query({
    database_id: process.env.NOTION_INTCUBE_PROJECT_DB!,
  });
  console.log("Got response:", notionProjectDb);

  const allDeals = await hubspot.crm.deals.getAll()
  for (let deal of allDeals) {
    console.log(deal)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
