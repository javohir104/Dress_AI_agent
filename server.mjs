import { app } from './app.mjs';

const PORT = process.env.PORT || 8787;

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`  Kingsman Virtual Try-On Server ishga tushdi!  `);
  console.log(`  URL: http://localhost:${PORT}                 `);
  console.log(`=================================================\n`);
});
