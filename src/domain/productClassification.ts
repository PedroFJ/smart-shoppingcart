import { Product, SectionId } from "../data/sampleData";
import { normalizeForMatching } from "./search";

export type NewProductInput = {
  rawName: string;
  quantity?: string;
  note?: string;
  fallbackSectionId: SectionId;
};

export function classifyNewProduct(input: NewProductInput, products: Product[]): Product | null {
  const rawName = input.rawName.trim();

  if (!rawName) {
    return null;
  }

  const extractedNote = extractParentheticalNote(rawName);
  const nameWithoutNote = correctPortugueseGroceryText(extractedNote.cleanName);
  const brand = detectBrand(nameWithoutNote);
  const sectionId = detectSectionId(nameWithoutNote, input.note, input.fallbackSectionId);
  const noteParts = [
    extractedNote.note ? correctPortugueseGroceryText(extractedNote.note) : undefined,
    input.note?.trim() ? correctPortugueseGroceryText(input.note.trim()) : undefined
  ].filter(Boolean);
  const productNameWithoutBrand = removeDetectedBrand(nameWithoutNote, brand);
  const name = tidyProductName(isUsefulProductName(productNameWithoutBrand) ? productNameWithoutBrand : nameWithoutNote);
  const isExact = Boolean(brand) || isSpecificProduct(nameWithoutNote) || noteParts.length > 0;

  return {
    id: createProductId(`${brand ? `${brand} ` : ""}${name}`, products),
    name,
    brand,
    note: noteParts.join(" - ") || undefined,
    sectionId,
    defaultQuantity: input.quantity?.trim() || "1 un",
    defaultAcceptsAlternatives: !isExact
  };
}

function extractParentheticalNote(value: string): { cleanName: string; note?: string } {
  const match = value.match(/\(([^)]+)\)/);

  if (!match) {
    return {
      cleanName: value
    };
  }

  return {
    cleanName: value.replace(/\s*\([^)]+\)\s*/g, " ").trim(),
    note: tidyProductName(match[1])
  };
}

function detectBrand(value: string): string | undefined {
  const normalized = normalizeForMatching(value);
  const brands = [
    "agua das pedras",
    "coca-cola",
    "confort",
    "dentagard",
    "dove",
    "elvive",
    "evax",
    "gillette venus",
    "gillette",
    "lactacyd",
    "mimosa",
    "neoblanc",
    "nivea",
    "penacova",
    "wc pato",
    "uhu"
  ];
  const foundBrand = brands.find((candidate) => normalized.includes(candidate));

  return foundBrand ? tidyBrandName(foundBrand) : undefined;
}

function removeDetectedBrand(value: string, brand?: string): string {
  if (!brand) {
    return value;
  }

  return value.replace(new RegExp(escapeRegExp(brand), "i"), " ").replace(/\s+/g, " ").trim();
}

function detectSectionId(value: string, note: string | undefined, fallbackSectionId: SectionId): SectionId {
  const normalized = normalizeForMatching(`${value} ${note ?? ""}`);

  if (normalized.includes("ananas") || normalized.includes("ananaz")) {
    return "fruit-veg";
  }

  const sectionRules: Array<{ sectionId: SectionId; keywords: string[] }> = [
    {
      sectionId: "personal-care",
      keywords: ["amaciador marta", "barba", "cabelo", "creme corpo", "desodorizante", "discos desmaquilhantes", "escova", "gel banho", "lactacid", "laminas", "pasta de dentes", "pensos", "shampoo", "shampo"]
    },
    {
      sectionId: "cleaning",
      keywords: ["agua com cheiro", "detergente", "esfregao", "guardanapos", "lava tudo", "lixivia", "maquina loica", "multiusos", "papel higienico", "rolo cozinha", "sacos lixo", "spray", "wc pato"]
    },
    {
      sectionId: "fruit-veg",
      keywords: ["agrioes", "alface", "alho", "ananas", "ananaz", "banana", "batata", "brocolo", "cebola", "cenoura", "chuchu", "coentros", "courgete", "feijao verde", "hortela", "kiwi", "laranja", "lima", "limao", "maca", "pera", "salsa", "tomate"]
    },
    {
      sectionId: "frozen",
      keywords: ["congelado", "gelo", "grelos", "jardineira", "noisettes", "pizza", "pure"]
    },
    {
      sectionId: "fish",
      keywords: ["bacalhau", "peixe"]
    },
    {
      sectionId: "meat",
      keywords: ["carne", "entrecosto"]
    },
    {
      sectionId: "dairy",
      keywords: ["clara de ovo", "iogurte", "leite", "manteiga", "margarina", "natas", "ovos", "presunto", "queijo"]
    },
    {
      sectionId: "household",
      keywords: ["acendalha", "carvao", "filtro agua", "fosforo"]
    },
    {
      sectionId: "pantry",
      keywords: ["arroz", "atum", "azeite", "bolacha", "bolo", "cafe", "cha", "chocolate", "feijao frade", "flocos", "grao", "maionese", "mostarda", "oleo", "sal", "vinagre", "vinho branco temperar"]
    },
    {
      sectionId: "drinks",
      keywords: ["agua", "cerveja", "coca", "tonica", "vinho branco", "vinho tinto"]
    },
    {
      sectionId: "bakery",
      keywords: ["pao"]
    }
  ];
  const matchingRule = sectionRules.find((rule) => {
    return rule.keywords.some((keyword) => normalized.includes(keyword));
  });

  return matchingRule?.sectionId ?? fallbackSectionId;
}

function isSpecificProduct(value: string): boolean {
  const normalized = normalizeForMatching(value);
  const specificWords = ["acores", "marta", "pedro", "vanda", "roxo", "roxa", "laranja", "magro", "promocao", "sem ser", "nao muito", "macho 3"];

  return specificWords.some((word) => normalized.includes(word));
}

function isUsefulProductName(value: string): boolean {
  const normalized = normalizeForMatching(value);

  return /[a-z]/.test(normalized) && !/^\d+\s*(un|l|litro|litros|kg|g)?$/.test(normalized);
}

function tidyProductName(value: string): string {
  const corrections = new Map([
    ["acores", "Açores"],
    ["agrioes", "Agriões"],
    ["ananas", "Ananás"],
    ["ananaz", "Ananás"],
    ["brocolos", "Brócolos"],
    ["cafe", "Café"],
    ["cha", "Chá"],
    ["de", "de"],
    ["do", "do"],
    ["dos", "dos"],
    ["limao", "Limão"],
    ["limoes", "Limões"],
    ["lixivia", "Lixívia"],
    ["loica", "loiça"],
    ["maca", "Maçã"],
    ["macas", "Maçãs"],
    ["pao", "Pão"],
    ["pera", "Pêra"],
    ["peras", "Peras"],
    ["shampo", "Shampoo"],
    ["shampoo", "Shampoo"]
  ]);

  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const normalized = normalizeForMatching(word);
      const corrected = corrections.get(normalized);

      if (corrected) {
        return corrected;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function correctPortugueseGroceryText(value: string): string {
  return value
    .replace(/\bananaz\b/gi, "ananás")
    .replace(/\bananas dos acores\b/gi, "ananás dos Açores")
    .replace(/\bananas do acores\b/gi, "ananás dos Açores")
    .replace(/\bananas de acores\b/gi, "ananás dos Açores")
    .replace(/\bananas doe acores\b/gi, "ananás dos Açores")
    .replace(/\bananas dos açores\b/gi, "ananás dos Açores")
    .replace(/\bananás dos acores\b/gi, "ananás dos Açores")
    .replace(/\bananás do acores\b/gi, "ananás dos Açores")
    .replace(/\bananás de acores\b/gi, "ananás dos Açores")
    .replace(/\bananás doe acores\b/gi, "ananás dos Açores")
    .replace(/\bananás dos açores\b/gi, "ananás dos Açores")
    .replace(/\bdoe\b/gi, "dos")
    .replace(/\bacores\b/gi, "Açores");
}

function tidyBrandName(value: string): string {
  const brandNames = new Map([
    ["agua das pedras", "Água das Pedras"],
    ["coca-cola", "Coca-Cola"],
    ["confort", "Confort"],
    ["dentagard", "Dentagard"],
    ["dove", "Dove"],
    ["elvive", "Elvive"],
    ["evax", "Evax"],
    ["gillette venus", "Gillette Venus"],
    ["gillette", "Gillette"],
    ["lactacyd", "Lactacyd"],
    ["mimosa", "Mimosa"],
    ["neoblanc", "Neoblanc"],
    ["nivea", "Nivea"],
    ["penacova", "Penacova"],
    ["wc pato", "WC Pato"],
    ["uhu", "UHU"]
  ]);

  return brandNames.get(value) ?? tidyProductName(value);
}

function createProductId(name: string, products: Product[]): string {
  const baseId = normalizeProductId(name) || "produto";
  const existingIds = new Set(products.map((product) => product.id));
  let candidateId = baseId;
  let suffix = 2;

  while (existingIds.has(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidateId;
}

function normalizeProductId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
