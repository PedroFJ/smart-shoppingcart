export type SectionId =
  | "bakery"
  | "personal-care"
  | "cleaning"
  | "fruit-veg"
  | "frozen"
  | "meat-fish"
  | "dairy"
  | "pantry"
  | "drinks"
  | "household";

export type Product = {
  id: string;
  name: string;
  brand?: string;
  note?: string;
  lastPickedAt?: string;
  sectionId: SectionId;
  defaultQuantity: string;
  defaultAcceptsAlternatives: boolean;
  favorite?: boolean;
};

export type Section = {
  id: SectionId;
  name: string;
};

type ProductInput = {
  id: string;
  name: string;
  sectionId: SectionId;
  quantity?: string;
  brand?: string;
  note?: string;
  exact?: boolean;
  favorite?: boolean;
};

export const sections: Section[] = [
  { id: "bakery", name: "Padaria" },
  { id: "personal-care", name: "Higiene pessoal" },
  { id: "cleaning", name: "Limpeza" },
  { id: "fruit-veg", name: "Frutas e Legumes" },
  { id: "frozen", name: "Congelados" },
  { id: "meat-fish", name: "Carne e peixe" },
  { id: "dairy", name: "Laticínios" },
  { id: "pantry", name: "Mercearia" },
  { id: "drinks", name: "Bebidas" },
  { id: "household", name: "Casa" }
];

export const starterProducts: Product[] = [
  p({ id: "pao", name: "Pão", sectionId: "bakery", favorite: true }),
  p({ id: "pao-museu", name: "Pão Museu", sectionId: "bakery", exact: true, favorite: true }),
  p({ id: "cafe", name: "Café", sectionId: "pantry", favorite: true }),

  p({ id: "pasta-dentes-marta", name: "Pasta de dentes Marta", brand: "Dentagard", sectionId: "personal-care", exact: true }),
  p({ id: "pasta-dentes", name: "Pasta de dentes", sectionId: "personal-care" }),
  p({ id: "escova-dentes-media-pedro", name: "Escova de dentes média Pedro", sectionId: "personal-care", exact: true }),
  p({ id: "recarga-escova-eletrica", name: "Recarga escova elétrica", sectionId: "personal-care", exact: true }),
  p({ id: "recargas-gillette-venus-roxa", name: "Recargas Gillette Venus", brand: "Gillette Venus", note: "A roxa", sectionId: "personal-care", exact: true }),
  p({ id: "laminas-barba-gillette-mach3", name: "Lâminas barba Gillette macho 3", brand: "Gillette", sectionId: "personal-care", exact: true }),
  p({ id: "gel-barba", name: "Gel da barba", sectionId: "personal-care" }),
  p({ id: "desodorizante-pedro", name: "Desodorizante Pedro", sectionId: "personal-care", exact: true }),
  p({ id: "shampoo-marta", name: "Shampoo Marta", sectionId: "personal-care", exact: true }),
  p({ id: "shampoo-cabelos-oleosos-carvao", name: "Shampoo cabelos oleosos", note: "Frasco de carvão", sectionId: "personal-care", exact: true }),
  p({ id: "shampoo-pedro", name: "Shampoo Pedro", sectionId: "personal-care", exact: true }),
  p({ id: "amaciador-marta-elvive-roxo", name: "Amaciador Marta", brand: "Elvive roxo", sectionId: "personal-care", exact: true }),
  p({ id: "gel-banho-dove-promocao", name: "Gel banho Dove promoção", brand: "Dove", sectionId: "personal-care", exact: true }),
  p({ id: "gel-marca-branca-grande-recarga", name: "Gel marca branca grande recarga", sectionId: "personal-care", exact: true }),
  p({ id: "creme-corpo-refirmante-nivea", name: "Creme corpo refirmante", brand: "Nivea", sectionId: "personal-care", exact: true }),
  p({ id: "pensos-higienicos-evax-laranja", name: "Pensos higiénicos", brand: "Evax laranja", sectionId: "personal-care", exact: true }),
  p({ id: "pensos-diarios-zero-fragrancia", name: "Pensos diários 0% fragrância", sectionId: "personal-care", exact: true }),
  p({ id: "discos-desmaquilhantes", name: "Discos desmaquilhantes", sectionId: "personal-care" }),
  p({ id: "lactacid", name: "Lactacid", brand: "Lactacyd", sectionId: "personal-care", exact: true }),

  p({ id: "detergente-chao-lava-tudo", name: "Detergente chão lava tudo", sectionId: "cleaning" }),
  p({ id: "lixivia-uhu", name: "Lixívia UHU", brand: "UHU", sectionId: "cleaning", exact: true }),
  p({ id: "lixivia-neoblanc-gentil", name: "Lixívia Neoblanc Gentil", brand: "Neoblanc Gentil", sectionId: "cleaning", exact: true }),
  p({ id: "lixivia-pura", name: "Lixívia pura", sectionId: "cleaning" }),
  p({ id: "agua-cheiro-passar", name: "Água com cheiro para passar", sectionId: "cleaning" }),
  p({ id: "spray-limpa-placa-inducao", name: "Spray limpa placa indução", sectionId: "cleaning" }),
  p({ id: "amaciador-roupa-confort-roxo", name: "Amaciador roupa", brand: "Confort roxo", sectionId: "cleaning", exact: true }),
  p({ id: "spray-multiusos-po", name: "Spray multiusos pó", sectionId: "cleaning" }),
  p({ id: "detergente-chao", name: "Detergente do chão", sectionId: "cleaning" }),
  p({ id: "detergente-vidros", name: "Detergente dos vidros", sectionId: "cleaning" }),
  p({ id: "detergente-loica", name: "Detergente loiça", sectionId: "cleaning" }),
  p({ id: "pastilhas-maquina-loica", name: "Pastilhas máquina loiça", sectionId: "cleaning" }),
  p({ id: "detergente-roupa", name: "Detergente roupa", sectionId: "cleaning" }),
  p({ id: "wc-pato-recarga", name: "WC Pato recarga", brand: "WC Pato", sectionId: "cleaning", exact: true }),
  p({ id: "papel-higienico-4-folhas", name: "Papel higiénico 4 folhas", sectionId: "cleaning", exact: true }),
  p({ id: "guardanapos-bons", name: "Guardanapos bons", sectionId: "cleaning", exact: true }),
  p({ id: "rolo-cozinha", name: "Rolo de cozinha", sectionId: "cleaning" }),
  p({ id: "sacos-lixo-relva", name: "Sacos lixo relva", sectionId: "cleaning", exact: true }),
  p({ id: "sacos-lixo-cozinha-cheiro", name: "Sacos lixo cozinha litros cheiro", sectionId: "cleaning", exact: true }),
  p({ id: "esfregao-cozinha", name: "Esfregão cozinha", sectionId: "cleaning" }),
  p({ id: "esfregao-cozinha-bancada", name: "Esfregão cozinha bancada", sectionId: "cleaning" }),

  p({ id: "iogurtes-cabra-natural-morango", name: "Iogurtes de leite de cabra", note: "Natural ou morango, sem ser kefir", sectionId: "dairy", exact: true }),
  p({ id: "frutos-secos-cajus", name: "Frutos secos cajus", sectionId: "pantry" }),
  p({ id: "kiwis-grandes", name: "Kiwis grandes", note: "Não muito maduros", sectionId: "fruit-veg", exact: true }),
  p({ id: "peras-rocha", name: "Peras Rocha", sectionId: "fruit-veg", exact: true }),
  p({ id: "bananas", name: "Bananas", sectionId: "fruit-veg", favorite: true }),
  p({ id: "macas", name: "Maçãs", sectionId: "fruit-veg" }),
  p({ id: "mix-frutos-vermelhos", name: "Mix frutos vermelhos", sectionId: "frozen" }),
  p({ id: "grelos-congelados", name: "Grelos congelados", sectionId: "frozen" }),
  p({ id: "noisettes-congeladas", name: "Noisettes congeladas", sectionId: "frozen" }),
  p({ id: "pizzas-congeladas", name: "Pizzas congeladas", sectionId: "frozen" }),
  p({ id: "alface", name: "Alface", sectionId: "fruit-veg" }),
  p({ id: "tomate", name: "Tomate", sectionId: "fruit-veg" }),
  p({ id: "chuchu", name: "Chuchu", sectionId: "fruit-veg", quantity: "1" }),
  p({ id: "courgete", name: "Courgete", sectionId: "fruit-veg" }),
  p({ id: "hortela", name: "Hortelã", sectionId: "fruit-veg" }),
  p({ id: "salsa", name: "Salsa", sectionId: "fruit-veg" }),
  p({ id: "coentros", name: "Coentros", sectionId: "fruit-veg" }),
  p({ id: "agrioes", name: "Agriões", sectionId: "fruit-veg" }),
  p({ id: "alho", name: "Alho", sectionId: "fruit-veg" }),
  p({ id: "batatas-cozer", name: "Batatas cozer", sectionId: "fruit-veg", exact: true }),
  p({ id: "batatas-assar", name: "Batatas assar", sectionId: "fruit-veg", exact: true }),
  p({ id: "cebolas-brancas", name: "Cebolas brancas", sectionId: "fruit-veg", exact: true }),
  p({ id: "arroz-carolino", name: "Arroz carolino", sectionId: "pantry", exact: true }),
  p({ id: "arroz-agulha", name: "Arroz agulha", sectionId: "pantry", exact: true }),
  p({ id: "tomate-polpa-pedacos", name: "Tomate polpa e pedaços", sectionId: "pantry" }),
  p({ id: "ovos-duzia-medios", name: "Ovos dúzia médios", sectionId: "dairy", quantity: "2 dúzias", exact: true }),
  p({ id: "clara-ovo-pequeno", name: "Clara de ovo pequeno", sectionId: "dairy", exact: true }),
  p({ id: "limoes", name: "Limões", sectionId: "fruit-veg" }),
  p({ id: "laranjas-sumo", name: "Laranjas pequenas para sumo", note: "8 unidades", sectionId: "fruit-veg", quantity: "8", exact: true }),
  p({ id: "limas", name: "Limas", sectionId: "fruit-veg" }),
  p({ id: "feijao-verde", name: "Feijão verde", sectionId: "fruit-veg" }),
  p({ id: "cenouras", name: "Cenouras", sectionId: "fruit-veg" }),
  p({ id: "brocolos-verdes", name: "Brócolos", note: "Sem ser amarelos", sectionId: "fruit-veg", exact: true }),
  p({ id: "brocolos-congelados", name: "Brócolos congelados", sectionId: "frozen" }),
  p({ id: "jardineira", name: "Jardineira", sectionId: "frozen" }),
  p({ id: "pure-congelado", name: "Puré congelado", sectionId: "frozen" }),
  p({ id: "manteiga-pedro", name: "Manteiga Pedro", sectionId: "dairy", exact: true }),
  p({ id: "margarina-pequena", name: "Margarina pequena", sectionId: "dairy", exact: true }),
  p({ id: "presunto", name: "Presunto", sectionId: "dairy" }),
  p({ id: "cha-cavalinha", name: "Chá cavalinha saquetas", sectionId: "pantry", exact: true }),
  p({ id: "cha-cidreira", name: "Chá cidreira saquetas", sectionId: "pantry", exact: true }),
  p({ id: "infusao-espinheira-santa", name: "Infusão espinheira santa", sectionId: "pantry", exact: true }),
  p({ id: "queijo-fresco", name: "Queijo fresco", sectionId: "dairy" }),
  p({ id: "queijo-mozarela", name: "Queijo mozarela", sectionId: "dairy" }),
  p({ id: "bolachas-marinheiras", name: "Bolachas marinheiras", sectionId: "pantry", exact: true }),
  p({ id: "chocolate-negro", name: "Chocolate negro", sectionId: "pantry", exact: true }),
  p({ id: "bolos-secos", name: "Bolos secos", sectionId: "pantry" }),
  p({ id: "flocos", name: "Flocos", sectionId: "pantry" }),

  p({ id: "bacalhau", name: "Bacalhau", sectionId: "meat-fish" }),
  p({ id: "carne", name: "Carne", sectionId: "meat-fish" }),
  p({ id: "peixe", name: "Peixe", sectionId: "meat-fish" }),
  p({ id: "entrecosto-favas", name: "Entrecosto para favas", sectionId: "meat-fish", exact: true }),

  p({ id: "leite-pedro", name: "Leite Pedro", sectionId: "dairy", exact: true }),
  p({ id: "leite-vanda", name: "Leite Vanda", sectionId: "dairy", exact: true }),
  p({ id: "leite-marta", name: "Leite Marta", brand: "Mimosa magro", sectionId: "dairy", exact: true }),
  p({ id: "natas", name: "Natas", sectionId: "dairy" }),
  p({ id: "maionese", name: "Maionese", sectionId: "pantry" }),
  p({ id: "mostarda", name: "Mostarda", sectionId: "pantry" }),
  p({ id: "ketchup", name: "Ketchup", sectionId: "pantry" }),
  p({ id: "atum", name: "Atum", sectionId: "pantry" }),
  p({ id: "grao", name: "Grão", sectionId: "pantry" }),
  p({ id: "feijao-frade", name: "Feijão-frade", sectionId: "pantry", exact: true }),
  p({ id: "sal", name: "Sal", sectionId: "pantry" }),
  p({ id: "vinho-branco-temperar", name: "Vinho branco temperar", sectionId: "pantry", exact: true }),
  p({ id: "vinagre-balsamico", name: "Vinagre temperar balsâmico", sectionId: "pantry", exact: true }),
  p({ id: "azeite-garrafao-promocao", name: "Azeite garrafão", note: "Só se estiver em promoção", sectionId: "pantry", exact: true }),
  p({ id: "oleo-1-litro", name: "Óleo", sectionId: "pantry", quantity: "1 litro", exact: true }),

  p({ id: "cerveja", name: "Cerveja", sectionId: "drinks" }),
  p({ id: "aguas-penacova-05", name: "Águas 0,5 litro", brand: "Penacova", sectionId: "drinks", quantity: "6", exact: true }),
  p({ id: "agua-pedras", name: "Água das Pedras", brand: "Água das Pedras", sectionId: "drinks", exact: true }),
  p({ id: "coca-cola-1-litro", name: "Coca-Cola", brand: "Coca-Cola", sectionId: "drinks", quantity: "1 litro", exact: true }),
  p({ id: "agua-tonica", name: "Água tónica", sectionId: "drinks" }),
  p({ id: "vinho-tinto", name: "Vinho tinto", sectionId: "drinks" }),
  p({ id: "vinho-branco", name: "Vinho branco", sectionId: "drinks" }),

  p({ id: "carvao", name: "Carvão", sectionId: "household" }),
  p({ id: "acendalha", name: "Acendalha", sectionId: "household" }),
  p({ id: "fosforos", name: "Fósforos", sectionId: "household" }),
  p({ id: "filtro-agua", name: "Filtro água", sectionId: "household", exact: true }),
  p({ id: "gelo", name: "Gelo", sectionId: "frozen" })
];

export const defaultItinerary: SectionId[] = [
  "bakery",
  "personal-care",
  "cleaning",
  "fruit-veg",
  "frozen",
  "meat-fish",
  "dairy",
  "pantry",
  "drinks",
  "household"
];

function p(input: ProductInput): Product {
  return {
    id: input.id,
    name: input.name,
    brand: input.brand,
    note: input.note,
    sectionId: input.sectionId,
    defaultQuantity: input.quantity ?? "1 un",
    defaultAcceptsAlternatives: !input.exact,
    favorite: input.favorite
  };
}
