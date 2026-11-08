import JsBarcode from 'jsbarcode';

export const renderBarcodeToCanvas = (canvas: HTMLCanvasElement, text: string) => {
  try {
    JsBarcode(canvas, text, {
      format: 'CODE128',
      lineColor: '#0f172a',
      width: 2,
      height: 48,
      displayValue: true,
      fontSize: 13,
      font: 'monospace',
      textMargin: 4,
      background: '#ffffff',
    });
  } catch (err) {
    console.error('Failed to render barcode:', err);
  }
};

export const renderBarcodeToSvg = (svgElement: SVGSVGElement, text: string) => {
  try {
    JsBarcode(svgElement, text, {
      format: 'CODE128',
      lineColor: '#0f172a',
      width: 1.8,
      height: 44,
      displayValue: true,
      fontSize: 12,
      font: 'monospace',
      textMargin: 3,
      background: '#ffffff',
    });
  } catch (err) {
    console.error('Failed to render SVG barcode:', err);
  }
};
