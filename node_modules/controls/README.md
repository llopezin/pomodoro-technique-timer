# controls.js
#### framework for dynamic html documents and UI solutions, javascript templating
[![NPM version](https://badge.fury.io/js/controls.png)](http://badge.fury.io/js/controls)

controls.js - framework for a visual and data components  
bootstrap.controls.js - WCL based on bootstrap and controls.js

http://aplib.github.io/controls.js/
[Simple Markdown site template](http://aplib.github.io/markdown-site-template/)

##Get started  

### Installation

1. Download from GitHub
2. npm install controls

### files

controls.js - development version with comments  
controls.min.js - compressed controls.js  

Include the following code in your head tag:

    <script src="controls.js"></script>

### Hello World!

    <!DOCTYPE html>
    <html lang="en-US">
    <head>
        <meta charset="utf-8">
        <script src="controls.js"></script>
    </head>
    <body>
    <script type="text/javascript">
        var body = controls.create('body').attach();
        body
            .add('h1', 'Hello World!')
            .createElement();
    </script>
    </body>
    </html>

