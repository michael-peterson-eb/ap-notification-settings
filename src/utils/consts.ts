type Params = {
  id: string;

};

// Mock params for development
export const mockParams: Params = {
  id: '468992114', // plan id in new feature tenant
};

function getParamsFromDom(): Params | null {
  if (typeof window === 'undefined') return null;

  const el = document.getElementById('rjs-params');
  const params = el?.dataset.record;

  if (!params) return null;

  const parsed = JSON.parse(params) as Params;

  console.log('Parsed rjs-params:', parsed);

  return parsed;
}

export const params: Params = (() => {
  if (process.env.NODE_ENV === 'development') {
    return mockParams;
  }

  const domParams = getParamsFromDom();
  if (!domParams) {
    throw new Error('Missing rjs-params data-record attribute');
  }

  return domParams;
})();

// Platform URL is arbitrary. It just needs to be a valid page on the target origin.
export const PLATFORM_URL = 'https://eapps-test.eng.infiniteblue.com/prod1/m/main.jsp?view=main&pageId=468987151&objDefId=468975610&tabId=468991376&id=480121753';
export const PLATFORM_ORIGIN = 'https://eapps-test.eng.infiniteblue.com';
