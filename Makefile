.PHONY: package
package:
	ncc build index.js

.PHONY: package-watch
package-watch:
	ncc build index.js --watch
