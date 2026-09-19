/* NUTRETIUM — compatibilidad de variantes sobre la capa PIM normalizada. */
(function (root) {
  'use strict';
  const pim = root.NUTRETIUM_PIM;
  if (!pim) throw new Error('NUTRETIUM_PIM debe cargarse antes de product-variants.js');
  root.NUTRETIUM_VARIANTS = {
    rules: pim.RULES,
    meta: pim.meta,
    family: pim.family,
    factualDescription: pim.factualDescription,
    normalize: pim.normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
