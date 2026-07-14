const _userAgent = typeof navigator === 'object' ? navigator.userAgent : '';

export const isWindows = _userAgent.indexOf('Windows') >= 0;
export const isMacintosh = _userAgent.indexOf('Macintosh') >= 0;
export const isLinux = _userAgent.indexOf('Linux') >= 0;
export const isWeb = true;
export const isChrome = _userAgent.indexOf('Chrome') >= 0;
export const isEdge = _userAgent.indexOf('Edg/') >= 0;
export const isFirefox = _userAgent.indexOf('Firefox') >= 0;
export const isSafari = !isChrome && _userAgent.indexOf('Safari') >= 0;
