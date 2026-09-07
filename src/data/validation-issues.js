/** 収集するエラーの上限 */
export const MAX_ERRORS = 100;

/**
 * `E_XXX_YYY: 説明` 形式のメッセージ項目を生成する（CLAUDE.md 規約）。
 * @param {string} code
 * @param {string} message
 * @returns {{code:string, message:string}}
 */
function formatItem(code, message) {
  return { code, message: `${code}: ${message}` };
}

/**
 * エラーを収集配列に追加する（上限チェック付き）。
 * @param {Array<{code:string, message:string}>} list
 * @param {string} code
 * @param {string} message
 * @returns {boolean} 上限に達した場合 true
 */
export function pushError(list, code, message) {
  if (list.length >= MAX_ERRORS) return true;
  list.push(formatItem(code, message));
  return list.length >= MAX_ERRORS;
}

/**
 * 警告を収集配列に追加する。
 * @param {Array<{code:string, message:string}>} list
 * @param {string} code
 * @param {string} message
 */
export function pushWarning(list, code, message) {
  list.push(formatItem(code, message));
}

