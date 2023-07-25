const { JSDOM } = require('jsdom');
const { basename } = require('node:path');

/**
 * @return {import('vite').Plugin}
 */
exports.default = function() {
  return {
    name: 'asset-inline',
    enforce: 'post',
    config(config) {
      config.build = {
        ...config.build,
      };
    },
    /**
     * @param {import('rollup').OutputOptions} options
     * @param {import('rollup').OutputBundle} bundle
     */
    generateBundle(options, bundle) {
      const report = [];

      Object.entries(bundle).forEach(([fileName, asset]) => {
        if (!fileName.endsWith('.html')) {
          return;
        }

        const dom = new JSDOM(asset.source);
        const { window } = dom;
        const scriptsAndStyles = window.document.querySelectorAll(
          'disabled-script[type=module], link[rel=stylesheet], disabled-link[rel=modulepreload]',
        );

        scriptsAndStyles.forEach(domAsset => {

          if (domAsset.rel === 'modulepreload') {
            domAsset.remove();
            return;
          }

          const assetType = domAsset instanceof window.HTMLScriptElement ? 'script' : 'style';
          const urlProp = assetType === 'script' ? 'src' : 'href';
          const sourceProp = assetType === 'script' ? 'code' : 'source';

          report.push({ fileName, assetType, url: domAsset[urlProp] });

          const outputBundleElement = bundle[domAsset[urlProp].slice(1)];
          let domAssetContents = outputBundleElement[sourceProp];
          if (assetType === 'style') {
            let charsetIndex = domAssetContents.indexOf('@charset');
            while (charsetIndex >= 0) {
              const stmtEnd = domAssetContents.indexOf(';', charsetIndex);
              domAssetContents = domAssetContents.slice(0, charsetIndex) + domAssetContents.slice(stmtEnd + 1);
              charsetIndex = domAssetContents.indexOf('@charset');
            }
          } else {
            outputBundleElement.imports.forEach((theImport) => {
              const importFilename = basename(theImport);
              const importFilenamePos = domAssetContents.indexOf(importFilename);
              const importStmtStart = domAssetContents.lastIndexOf('import', importFilenamePos);
              const importStmtEnd = domAssetContents.indexOf(';', importFilenamePos);

              const code = (theImport in bundle) ? bundle[theImport].code : '';

              domAssetContents =
                domAssetContents.slice(0, importStmtStart) + code + domAssetContents.slice(importStmtEnd);
            });
          }

          const replacement = window.document.createElement(assetType);

          replacement.innerHTML = domAssetContents;
          if (assetType === 'script') {
            replacement.type = domAsset.type || 'module';
          }

          domAsset.remove();
          if (assetType === 'script') {
            window.document.body.append(replacement);
          } else {
            window.document.head.append(replacement);
          }
        });

        asset.source = dom.serialize();
      });

      console.log('');
      console.log('Inlined assets:');
      console.table(report);
    },
  };
};
