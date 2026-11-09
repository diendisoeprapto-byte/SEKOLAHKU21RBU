import JsBarcode from 'jsbarcode';

export const renderBarcodeToCanvas = (canvas: HTMLCanvasElement, text: string) => {
  try {
    JsBarcode(canvas, text, {
      format: 'CODE128',
      lineColor: '#000000',
      width: 2.2,
      height: 55,
      displayValue: true,
      fontSize: 14,
      font: 'monospace',
      margin: 10,
      textMargin: 6,
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
      lineColor: '#000000',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 13,
      font: 'monospace',
      margin: 8,
      textMargin: 5,
      background: '#ffffff',
    });
  } catch (err) {
    console.error('Failed to render SVG barcode:', err);
  }
};
