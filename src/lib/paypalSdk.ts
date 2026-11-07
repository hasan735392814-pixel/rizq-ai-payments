export interface PayPalApproveData {
  orderID: string;
}

export interface PayPalButtons {
  isEligible: () => boolean;
  render: (container: HTMLElement) => Promise<void>;
}

interface PayPalNamespace {
  Buttons: (options: {
    style?: Record<string, string | number>;
    createOrder: () => Promise<string>;
    onApprove: (data: PayPalApproveData) => Promise<void>;
    onCancel: () => void;
    onError: () => void;
  }) => PayPalButtons;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;

export function loadPayPalSdk(clientId: string, currency: string): Promise<PayPalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  const params = new URLSearchParams({ 'client-id': clientId, currency, intent: 'capture', components: 'buttons' });
  sdkPromise = new Promise<PayPalNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else {
        sdkPromise = null;
        reject(new Error('PayPal did not load. Check your connection and try again.'));
      }
    };
    script.onerror = () => {
      sdkPromise = null;
      script.remove();
      reject(new Error('PayPal did not load. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}
