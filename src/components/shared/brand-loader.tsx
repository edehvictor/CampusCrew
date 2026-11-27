export function BrandLoader() {
  return (
    <main className="brand-loader" role="status" aria-live="polite" aria-label="Opening Campuscrew">
      <div className="brand-loader-content">
        <div className="brand-loader-symbol" aria-hidden="true">
          <span className="brand-loader-orbit" />
          <span className="brand-loader-mark" />
        </div>
        <p className="brand-loader-name">Campuscrew</p>
        <p className="brand-loader-caption">Good help is on the way.</p>
        <div className="brand-loader-journey" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </main>
  );
}
