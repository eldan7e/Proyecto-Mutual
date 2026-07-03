// ESM loader hook: resolve imports without .js extension by appending .js
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && !specifier.endsWith('.js') && specifier.startsWith('.')) {
      return nextResolve(specifier + '.js', context);
    }
    throw err;
  }
}
