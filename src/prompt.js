/**
 * Kingsman Virtual Try-On Prompt Generator
 * Subkategoriya -> Hudud (upper/lower/footwear) + Inglizcha tur + Nomdagi detallar.
 * Qoida: Bitta amal, bitta hudud, 20-30 so'z, rangsiz prompt (rangni referens rasmdan oladi).
 */

const CATEGORY_MAP = {
  // Upper body (Ustki kiyimlar)
  "Kastyum Shim": { region: "upper", type: "classic tailored suit blazer and dress shirt" },
  "Pidjak": { region: "upper", type: "formal tailored suit jacket blazer" },
  "Kurtka": { region: "upper", type: "outerwear jacket with front zipper and collar" },
  "Vetrovka": { region: "upper", type: "lightweight windbreaker zip jacket" },
  "Sportivka": { region: "upper", type: "athletic sporty track jacket" },
  "Futbolka": { region: "upper", type: "casual fitted short-sleeve t-shirt" },
  "Vadalaska": { region: "upper", type: "long-sleeve turtleneck knit sweater" },
  "Kardigan": { region: "upper", type: "buttoned cardigan knitwear" },
  "Sviter": { region: "upper", type: "crewneck knitted sweater pullover" },
  "Svitshot": { region: "upper", type: "casual crewneck sweatshirt" },
  "Amerkanka": { region: "upper", type: "short-sleeve knit polo shirt" },
  "Kojinka": { region: "upper", type: "leather jacket with zipped pockets" },
  "Dvoyka": { region: "upper", type: "two-piece matching stylish blazer and top" },
  "Finka": { region: "upper", type: "minimalist casual light long-sleeve shirt" },
  "Nimcha": { region: "upper", type: "sleeveless tailored vest waistcoat" },

  // Lower body (Pastki kiyimlar)
  "Shim Pol Klassik": { region: "lower", type: "classic slim-fit dress trousers" },
  "Shim": { region: "lower", type: "formal tailored pants" },
  "Jeans": { region: "lower", type: "classic straight-fit denim jeans" },
  "Shalvar": { region: "lower", type: "comfortable tailored loose trousers" },

  // Footwear (Oyoq kiyimlar)
  "Loufer": { region: "footwear", type: "leather loafer dress shoes" },
  "Barsofka": { region: "footwear", type: "smart casual slip-on shoes" },
  "Krasofka": { region: "footwear", type: "athletic lifestyle sneakers" },
  "Tufli": { region: "footwear", type: "classic elegant Oxford leather shoes" },

  // DummyJSON kategoriyalari (Topshiriq 3-band)
  "mens-shirts": { region: "upper", type: "stylish men's formal button-down shirt" },
  "mens-shoes": { region: "footwear", type: "men's stylish casual footwear" },
  "tops": { region: "upper", type: "casual stylish modern top" },
  "womens-dresses": { region: "upper", type: "elegant high-fashion full-length dress" },
  "womens-shoes": { region: "footwear", type: "chic women's designer shoes" }
};

// Nomdagi maxsus detallarni inglizchaga tarjima qilish
const DETAIL_KEYWORDS = [
  { match: /kapishon/i, detail: "hooded drawstring hood" },
  { match: /mex/i, detail: "fur-lined collar trim" },
  { match: /zamok/i, detail: "metallic zipper closure" },
  { match: /tugma|pugov/i, detail: "front button placket" },
  { match: /cho['’`]?ntak/i, detail: "functional side pockets" },
  { match: /koja|charim/i, detail: "premium leather texture" },
  { match: /zamsh/i, detail: "soft suede fabric texture" },
  { match: /jakard/i, detail: "jacquard textured weave" },
  { match: /klassik/i, detail: "refined elegant tailored finish" },
  { match: /sport/i, detail: "modern sporty silhouette" },
  { match: /oversize|over/i, detail: "relaxed oversized fit" },
  { match: /slim|drop/i, detail: "sharp slim-fit cut" }
];

/**
 * Mahsulot uchun Decart VTON promptini hosil qiladi
 * @param {Object} product - { name, subcategory, category }
 * @returns {{ region: string, prompt: string, rawType: string }}
 */
export function generatePrompt(product) {
  const subcat = product.subcategory || product.category || "Pidjak";
  const mapping = CATEGORY_MAP[subcat] || { region: "upper", type: "casual stylish apparel" };
  const region = mapping.region;

  // Detallarni aniqlash
  const detectedDetails = [];
  const textToScan = `${product.name || ""} ${subcat}`.toLowerCase();
  
  for (const { match, detail } of DETAIL_KEYWORDS) {
    if (match.test(textToScan)) {
      detectedDetails.push(detail);
    }
  }

  const detailsString = detectedDetails.length > 0 
    ? `featuring ${detectedDetails.slice(0, 3).join(", ")}` 
    : "with seamless natural tailored fit";

  let promptText = "";
  if (region === "upper") {
    promptText = `Seamlessly replace upper garment with ${mapping.type}, ${detailsString}, perfectly matching exact reference garment design, realistic fabric drape and lighting.`;
  } else if (region === "lower") {
    promptText = `Seamlessly replace lower body pants with ${mapping.type}, ${detailsString}, matching reference fabric texture and proportions naturally.`;
  } else {
    promptText = `Seamlessly wear ${mapping.type} on feet, ${detailsString}, matching the exact footwear shape and clean soles from reference image.`;
  }

  return {
    region,
    prompt: promptText,
    rawType: mapping.type
  };
}
