
import { Book } from '../types';

export const INITIAL_INVENTORY: Book[] = [
  {
    id: '1',
    title: 'O Pequeno Príncipe',
    author: 'Antoine de Saint-Exupéry',
    isbn: '9788522031382',
    description: 'Um clássico da literatura infantil sobre amizade, amor e a natureza humana.',
    genre: 'Infantil/Filosofia',
    targetAge: 'Todas as idades',
    price: 34.90,
    stockCount: 15
  },
  {
    id: '2',
    title: '1984',
    author: 'George Orwell',
    isbn: '9788535914849',
    description: 'Uma distopia perturbadora sobre vigilância e controle governamental.',
    genre: 'Ficção Científica/Distopia',
    targetAge: 'Adolescente/Adulto',
    price: 49.90,
    stockCount: 8
  },
  {
    id: '3',
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    isbn: '9788573210452',
    description: 'A clássica dúvida brasileira: Capitu traiu Bentinho?',
    genre: 'Literatura Brasileira/Clássico',
    targetAge: 'Adolescente/Adulto',
    price: 29.90,
    stockCount: 12
  },
  {
    id: '4',
    title: 'Harry Potter e a Pedra Filosofal',
    author: 'J.K. Rowling',
    isbn: '9788532530783',
    description: 'O início da jornada do bruxo mais famoso do mundo em Hogwarts.',
    genre: 'Fantasia/Aventura',
    targetAge: 'Infantojuvenil',
    price: 59.90,
    stockCount: 20
  },
  {
    id: '5',
    title: 'Sapiens: Uma Breve História da Humanidade',
    author: 'Yuval Noah Harari',
    isbn: '9788525432186',
    description: 'Uma exploração fascinante da nossa história desde os primórdios até o presente.',
    genre: 'Não-ficção/Antropologia',
    targetAge: 'Adulto',
    price: 69.90,
    stockCount: 5
  },
  {
    id: '6',
    title: 'Mitologia dos Orixás',
    author: 'Reginaldo Prandi',
    isbn: '9788571647749',
    description: 'A mais completa coleção de mitos da religião dos orixás já reunida em todo o mundo.',
    genre: 'Religião/Cultura Africana',
    targetAge: 'Adulto',
    price: 84.90,
    stockCount: 3
  },
  {
    id: '7',
    title: 'O Povo de Santo',
    author: 'Vagner Gonçalves da Silva',
    isbn: '9788531408801',
    description: 'Um estudo profundo sobre as religiões afro-brasileiras e sua resistência cultural.',
    genre: 'Antropologia/Religião',
    targetAge: 'Adulto',
    price: 58.00,
    stockCount: 2
  },
  {
    id: '8',
    title: 'Torto Arado',
    author: 'Itamar Vieira Junior',
    isbn: '9788582851159',
    description: 'Um romance épico e lírico sobre a vida de trabalhadores rurais no sertão baiano.',
    genre: 'Literatura Brasileira/Contemporânea',
    targetAge: 'Adulto',
    price: 62.90,
    stockCount: 10
  }
];
