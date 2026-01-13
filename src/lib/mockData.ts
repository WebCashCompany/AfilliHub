// Mock data generation for the affiliate dashboard

export type Marketplace = 'mercadolivre' | 'amazon' | 'magalu' | 'shopee';

export type ProductStatus = 'active' | 'protected' | 'risk' | 'inactive';

export interface Product {
  id: string;
  name: string;
  image: string;
  marketplace: Marketplace;
  status: ProductStatus;
  price: number;
  originalPrice: number;
  discount: number;
  category: string;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  stock: number;
  addedAt: Date;
  lastClickAt: Date | null;
  affiliateLink: string;
}

export interface DailyMetrics {
  date: string;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
}

export interface CategoryMetrics {
  category: string;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface MarketplaceMetrics {
  marketplace: Marketplace;
  products: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

const categories = [
  'Eletrônicos', 'Casa e Decoração', 'Moda Feminina', 'Moda Masculina',
  'Beleza', 'Esportes', 'Games', 'Livros', 'Brinquedos', 'Automotivo',
  'Informática', 'Celulares', 'Eletrodomésticos', 'Ferramentas', 'Pet Shop'
];

const productNames = {
  'Eletrônicos': ['Smart TV 55"', 'Fone Bluetooth', 'Câmera Webcam', 'Ring Light', 'Power Bank 20000mAh', 'Carregador Turbo', 'Cabo USB-C', 'Caixa de Som JBL', 'Echo Dot', 'Fire TV Stick'],
  'Casa e Decoração': ['Jogo de Panelas', 'Liquidificador', 'Air Fryer', 'Aspirador Robô', 'Cafeteira Expresso', 'Luminária LED', 'Ventilador Torre', 'Purificador de Água', 'Forno Elétrico', 'Chaleira Elétrica'],
  'Moda Feminina': ['Vestido Midi', 'Bolsa Transversal', 'Tênis Casual', 'Biquíni Set', 'Jaqueta Jeans', 'Calça Legging', 'Blusa Cropped', 'Saia Plissada', 'Sandália Rasteira', 'Relógio Feminino'],
  'Moda Masculina': ['Camisa Social', 'Calça Jeans', 'Tênis Nike', 'Bermuda Sarja', 'Jaqueta Bomber', 'Polo Ralph Lauren', 'Cueca Box Kit', 'Carteira Couro', 'Óculos de Sol', 'Relógio Casio'],
  'Beleza': ['Kit Skincare', 'Perfume Importado', 'Secador de Cabelo', 'Chapinha Babyliss', 'Kit Maquiagem', 'Creme Hidratante', 'Protetor Solar', 'Sérum Vitamina C', 'Máscara Capilar', 'Escova Rotativa'],
  'Esportes': ['Tênis Corrida', 'Bicicleta Aro 29', 'Kit Halteres', 'Esteira Elétrica', 'Colchonete Yoga', 'Whey Protein', 'Corda de Pular', 'Luvas de Boxe', 'Bola de Futebol', 'Patins Inline'],
  'Games': ['PlayStation 5', 'Xbox Series X', 'Nintendo Switch', 'Headset Gamer', 'Mouse Gamer', 'Teclado Mecânico', 'Cadeira Gamer', 'Controle Extra', 'HD Externo 2TB', 'Webcam Streamer'],
  'Livros': ['Box Harry Potter', 'Kindle Paperwhite', 'Biblia Sagrada', 'A Arte da Guerra', 'O Poder do Hábito', 'Pai Rico Pai Pobre', 'Mindset', 'Sapiens', 'Atomic Habits', '1984 George Orwell'],
  'Brinquedos': ['LEGO Star Wars', 'Barbie Dreamhouse', 'Hot Wheels Pack', 'Nerf Elite', 'Quebra-cabeça 1000p', 'Massinha Play-Doh', 'Carrinho Controle', 'Boneca Baby Alive', 'Pista Hot Wheels', 'Uno Jogo'],
  'Automotivo': ['Câmera de Ré', 'Som Automotivo', 'GPS Tracker', 'Capa para Carro', 'Aspirador 12V', 'Carregador Veicular', 'Organizador Porta-Malas', 'Suporte Celular', 'Sensor de Estacionamento', 'Lâmpada LED Farol'],
  'Informática': ['Notebook Gamer', 'Monitor 27"', 'SSD 1TB', 'Memória RAM 16GB', 'Placa de Vídeo', 'Webcam Full HD', 'Hub USB', 'Mouse Pad Gamer', 'Cooler Notebook', 'Roteador WiFi 6'],
  'Celulares': ['iPhone 15 Pro', 'Samsung Galaxy S24', 'Xiaomi 14', 'Motorola Edge', 'Capinha iPhone', 'Película 3D', 'Carregador Wireless', 'Suporte Veicular', 'Fone P2', 'Bateria Externa'],
  'Eletrodomésticos': ['Geladeira Frost Free', 'Máquina de Lavar', 'Micro-ondas', 'Fogão 5 Bocas', 'Ar Condicionado', 'Secadora de Roupas', 'Lava-Louças', 'Freezer Vertical', 'Depurador de Ar', 'Cooktop Indução'],
  'Ferramentas': ['Furadeira Parafusadeira', 'Kit Chaves', 'Serra Circular', 'Multímetro Digital', 'Compressor de Ar', 'Esmerilhadeira', 'Trena a Laser', 'Nível a Laser', 'Alicate Universal', 'Jogo de Brocas'],
  'Pet Shop': ['Ração Premium 15kg', 'Cama para Pet', 'Arranhador Gato', 'Coleira GPS', 'Shampoo Pet', 'Comedouro Automático', 'Caixa de Transporte', 'Brinquedo Interativo', 'Tapete Higiênico', 'Escova Desembaraçadora']
};

const marketplaces: Marketplace[] = ['mercadolivre', 'amazon', 'magalu', 'shopee'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysAgo));
  date.setHours(randomInt(0, 23), randomInt(0, 59));
  return date;
}

function generateProductId(): string {
  return `prod_${Math.random().toString(36).substring(2, 11)}`;
}

function getProductImage(category: string, index: number): string {
  const imageIds = [
    '400/300', '401/300', '402/300', '403/300', '404/300',
    '405/300', '406/300', '407/300', '408/300', '409/300'
  ];
  return `https://picsum.photos/seed/${category.toLowerCase().replace(/\s/g, '')}${index}/${imageIds[index % imageIds.length]}`;
}

export function generateProducts(count: number = 500): Product[] {
  const products: Product[] = [];

  for (let i = 0; i < count; i++) {
    const category = categories[randomInt(0, categories.length - 1)];
    const categoryProducts = productNames[category as keyof typeof productNames] || productNames['Eletrônicos'];
    const productName = categoryProducts[randomInt(0, categoryProducts.length - 1)];
    const marketplace = marketplaces[randomInt(0, marketplaces.length - 1)];
    
    const originalPrice = randomFloat(29.90, 4999.90);
    const discount = randomInt(5, 70);
    const price = originalPrice * (1 - discount / 100);
    
    const clicks = randomInt(0, 5000);
    const conversionRate = randomFloat(0.01, 0.15);
    const conversions = Math.floor(clicks * conversionRate);
    const commissionRate = randomFloat(0.03, 0.12);
    const revenue = conversions * price * commissionRate;
    
    const addedAt = randomDate(30);
    const hasClicks = clicks > 0;
    
    let status: ProductStatus = 'active';
    if (clicks === 0 && addedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      status = 'risk';
    } else if (randomInt(1, 10) <= 2) {
      status = 'protected';
    } else if (randomInt(1, 20) === 1) {
      status = 'inactive';
    }

    products.push({
      id: generateProductId(),
      name: `${productName} - ${marketplace.charAt(0).toUpperCase() + marketplace.slice(1)}`,
      image: getProductImage(category, i),
      marketplace,
      status,
      price: Number(price.toFixed(2)),
      originalPrice: Number(originalPrice.toFixed(2)),
      discount,
      category,
      clicks,
      conversions,
      revenue: Number(revenue.toFixed(2)),
      ctr: clicks > 0 ? Number((conversions / clicks * 100).toFixed(2)) : 0,
      stock: randomInt(0, 500),
      addedAt,
      lastClickAt: hasClicks ? randomDate(7) : null,
      affiliateLink: `https://affiliate.link/${marketplace}/${generateProductId()}`
    });
  }

  return products.sort((a, b) => b.revenue - a.revenue);
}

export function generateDailyMetrics(days: number = 30): DailyMetrics[] {
  const metrics: DailyMetrics[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    const baseClicks = randomInt(800, 3000);
    const trend = 1 + (days - i) * 0.02; // Slight upward trend
    const clicks = Math.floor(baseClicks * trend);
    const conversions = Math.floor(clicks * randomFloat(0.02, 0.08));
    const avgOrderValue = randomFloat(80, 250);
    const commissionRate = 0.08;
    const revenue = conversions * avgOrderValue * commissionRate;

    metrics.push({
      date: date.toISOString().split('T')[0],
      clicks,
      conversions,
      revenue: Number(revenue.toFixed(2)),
      ctr: Number((conversions / clicks * 100).toFixed(2))
    });
  }

  return metrics;
}

export function generateCategoryMetrics(products: Product[]): CategoryMetrics[] {
  const categoryMap = new Map<string, CategoryMetrics>();

  products.forEach(product => {
    const existing = categoryMap.get(product.category);
    if (existing) {
      existing.clicks += product.clicks;
      existing.conversions += product.conversions;
      existing.revenue += product.revenue;
    } else {
      categoryMap.set(product.category, {
        category: product.category,
        clicks: product.clicks,
        conversions: product.conversions,
        revenue: product.revenue
      });
    }
  });

  return Array.from(categoryMap.values())
    .sort((a, b) => b.revenue - a.revenue);
}

export function generateMarketplaceMetrics(products: Product[]): MarketplaceMetrics[] {
  const marketplaceMap = new Map<Marketplace, MarketplaceMetrics>();

  marketplaces.forEach(mp => {
    marketplaceMap.set(mp, {
      marketplace: mp,
      products: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0
    });
  });

  products.forEach(product => {
    const metrics = marketplaceMap.get(product.marketplace)!;
    metrics.products++;
    metrics.clicks += product.clicks;
    metrics.conversions += product.conversions;
    metrics.revenue += product.revenue;
  });

  return Array.from(marketplaceMap.values());
}

export function getMarketplaceName(marketplace: Marketplace): string {
  const names = {
    mercadolivre: 'Mercado Livre',
    amazon: 'Amazon',
    magalu: 'Magalu',
    shopee: 'Shopee'
  };
  return names[marketplace];
}

export function getMarketplaceColor(marketplace: Marketplace): string {
  const colors = {
    mercadolivre: 'marketplace-ml',
    amazon: 'marketplace-amazon',
    magalu: 'marketplace-magalu',
    shopee: 'marketplace-shopee'
  };
  return colors[marketplace];
}

export function getStatusColor(status: ProductStatus): string {
  const colors = {
    active: 'bg-status-active text-white',
    protected: 'bg-status-protected text-white',
    risk: 'bg-status-risk text-white',
    inactive: 'bg-status-inactive text-white'
  };
  return colors[status];
}

export function getStatusLabel(status: ProductStatus): string {
  const labels = {
    active: 'Ativo',
    protected: 'Protegido',
    risk: 'Em Risco',
    inactive: 'Inativo'
  };
  return labels[status];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
