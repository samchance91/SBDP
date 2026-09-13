// Expense categories. `id` is stored; `icon` maps to a ui.js icon; labels are
// looked up via i18n (cat_<id>) with the English fallback shown here.

export const CATEGORIES = [
  { id: 'food', icon: 'food' },
  { id: 'grocery', icon: 'grocery' },
  { id: 'transport', icon: 'transport' },
  { id: 'fuel', icon: 'fuel' },
  { id: 'hotel', icon: 'hotel' },
  { id: 'travel', icon: 'travel' },
  { id: 'rent', icon: 'rent' },
  { id: 'utilities', icon: 'utilities' },
  { id: 'household', icon: 'rent' },
  { id: 'entertainment', icon: 'entertainment' },
  { id: 'shopping', icon: 'shopping' },
  { id: 'healthcare', icon: 'healthcare' },
  { id: 'education', icon: 'education' },
  { id: 'subscription', icon: 'subscription' },
  { id: 'gifts', icon: 'gift' },
  { id: 'office', icon: 'briefcase' },
  { id: 'misc', icon: 'misc' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const categoryIcon = (id) => (BY_ID[id]?.icon) || 'receipt';
export const isCategory = (id) => !!BY_ID[id];

// English labels (also the i18n fallback).
export const CAT_LABEL = {
  food: 'Food & Dining', grocery: 'Grocery', transport: 'Transport', fuel: 'Fuel',
  hotel: 'Hotel', travel: 'Travel', rent: 'Rent', utilities: 'Utilities',
  household: 'Household', entertainment: 'Entertainment', shopping: 'Shopping',
  healthcare: 'Healthcare', education: 'Education', subscription: 'Subscription',
  gifts: 'Gifts', office: 'Office', misc: 'Miscellaneous',
};
