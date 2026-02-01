import { createDirectus, rest } from '@directus/sdk';

const directus = createDirectus('http://127.0.0.1:8055')
  .with(rest());

export default directus;
