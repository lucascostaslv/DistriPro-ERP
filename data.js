export const INITIAL_PRODUCTS = [
  { id: 1, name: 'Cerveja Pilsen 350ml (Pack 12)', price: 45.90, cost: 32.00, stock: 150, category: 'Cervejas' },
  { id: 2, name: 'Refrigerante Cola 2L', price: 9.50, cost: 5.50, stock: 80, category: 'Refrigerantes' },
  { id: 3, name: 'Água Mineral s/ Gás 500ml', price: 3.00, cost: 0.80, stock: 300, category: 'Água' },
  { id: 4, name: 'Whisky 12 Anos 1L', price: 189.90, cost: 120.00, stock: 15, category: 'Destilados' },
  { id: 5, name: 'Vodka Premium 750ml', price: 89.90, cost: 55.00, stock: 25, category: 'Destilados' },
  { id: 6, name: 'Energético Lata 250ml', price: 12.00, cost: 6.50, stock: 60, category: 'Energéticos' },
];

export const INITIAL_CLIENTS = [
  { id: 1, name: 'Restaurante Sabor & Arte', phone: '(11) 99999-1111', type: 'PJ', debt: 0 },
  { id: 2, name: 'Bar do Zé', phone: '(11) 98888-2222', type: 'PJ', debt: 150.00 },
  { id: 3, name: 'João Silva (Consumidor)', phone: '(11) 97777-3333', type: 'PF', debt: 0 },
];

export const INITIAL_FEE_PROFILES = [
  { 
    id: 1, 
    name: 'Padrão (Genérico)', 
    debit: 1.99, 
    pix: 0.99, 
    credit: { 1: 3.19, 2: 3.59, 3: 3.99, 4: 4.59, 5: 5.00, 6: 5.50, 7: 6.00, 8: 6.50, 9: 7.00, 10: 7.50, 11: 8.00, 12: 8.50 } 
  },
  { 
    id: 2, 
    name: 'Máquina Cielo', 
    debit: 2.39, 
    pix: 0, 
    credit: { 1: 4.99, 2: 5.59, 3: 5.99, 4: 6.59, 5: 7.00, 6: 7.50, 7: 8.00, 8: 8.50, 9: 9.00, 10: 9.50, 11: 10.00, 12: 10.50 }
  },
];