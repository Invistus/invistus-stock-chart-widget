const DEFAULT_CANVAS_WIDTH = '600px';
const DEFAULT_CANVAS_HEIGHT = '400px';
const DEFAULT_CANVAS_BORDER = '1px solid #c3c3c3';
const DEFAULT_SHOW_MOUSE_POSITIONS = true;
const DEFAULT_CANDLESTICK_OFFSET_WIDTH = 0.5;
const DEFAULT_FONT_AXIS = '400 .8rem Roboto';

const LAYERS = {
    chart: 0,
    yaxis: 10,
    mouse: 10000
}

const formatNumber = value => value && value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const formatDateTime = dt => `${dt.getDate()}/${dt.getMonth()}/${dt.getFullYear().toString().substr(-2)} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
const floor = value => Math.floor(value);

class InivistusStockView {

    constructor(options) {
        this.options = options ? options : {};
        console.log('creating InivistusStockView', this.options);
    }

    render(element) {
        console.log('Render chart', element);
        // Init Chart
        element.style.width = this.options.width ? this.options.width : DEFAULT_CANVAS_WIDTH;
        element.style.height = this.options.height ? this.options.height : DEFAULT_CANVAS_HEIGHT;
        element.style.border = this.options.border ? this.options.border : DEFAULT_CANVAS_BORDER;
        element.style.position = 'relative';
        this.chart = new Chart({ viewElement: element, ...this.options });

        let data = this.options.data;
        if (typeof data === 'function') {
            data = data();
        }
        this.chart.render(data);
    }

}

class Layer {
    
    constructor({ viewElement, ...options }) {
        if (!viewElement) {
            throw 'Canvas element not loaded';
        }
        this.options = options ? options : {};
        this.viewElement = viewElement;
    }

    createCanvas({ width, height, zIndex }) {
        const element = document.createElement('canvas');
        element.width = width ? width : this.viewElement.offsetWidth;
        element.height = height ? height : this.viewElement.offsetHeight;
        element.style.position = 'absolute';
        element.style.zIndex = zIndex;
        this.viewElement.appendChild(element);
        return element;
    }

    eraseCanvas(canvas) {
        if (!canvas) {
            throw 'Context is undefined';
        }
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
}

class Chart extends Layer {

    constructor(options) {
        super(options);
        this.chartCanvasElement = this.createCanvas({ width: this.viewElement.offsetWidth,
                                                      zIndex: LAYERS.chart });
    }

    render(data) {
        this.eraseCanvas(this.chartCanvasElement);

        // Create axis and update chart canvas area
        const padding = 0.2;
        const highest =  data.summary.high + ((data.summary.high - data.summary.low) * padding);
        const lowest = data.summary.low - ((data.summary.high - data.summary.low) * padding);
        const datetimes = data.data.map(item => formatDateTime(new Date(item.datetime)));
       
        // Y Axis (prices)
        const yAxis = new YAxis({   width: this.chartCanvasElement.width,
                                    height: this.chartCanvasElement.height,
                                    viewElement: this.viewElement });
        yAxis.render({ high: highest, low: lowest });
        this.chartCanvasElement.width -= yAxis.width;

        // X Axis (time period)
        const xAxis = new XAxis({   width: this.chartCanvasElement.width,
                                    height: this.chartCanvasElement.height,
                                    viewElement: this.viewElement });
        xAxis.render({ datetimes: datetimes });
        this.chartCanvasElement.height -= xAxis.height;

        // Mouse
        const mouseLayer = new MouseLayer({ width: this.chartCanvasElement.width,
                                            height: this.chartCanvasElement.height,
                                            viewElement: this.viewElement });
        mouseLayer.render({ high: highest, low: lowest, datetimes: datetimes });
        
        const width = this.chartCanvasElement.width / data.data.length;
        const candlesticks = new Candlestick({  canvas: this.chartCanvasElement, 
                                                high: highest, 
                                                low: lowest,
                                                width: width });
                                            
        data.data.forEach((item, index) => {
            candlesticks.render({ index: index, ...item});
        });

    }

}

class MouseLayer extends Layer {

    constructor(options) {
        super(options);
        this.mouseCanvasElement = this.createCanvas({ zIndex: LAYERS.mouse, ...options });
    }

    render(data) {
        // Change mouse cursor
        this.applyMousePointer(this.mouseCanvasElement);

        // Initialize mouse events
        this.initMouseEvents(this.mouseCanvasElement, data);
    }

    applyMousePointer(element) {
        element.style.cursor = 'crosshair';
    }

    drawMouseStrock(context, moveToX, moveToY, lineToA, lineToB) {
        context.strokeStyle = '#000000';
        context.lineWidth = .2;
        context.setLineDash([5, 5]);
        context.beginPath();          
        context.moveTo(moveToX, moveToY);
        context.lineTo(lineToA, lineToB);
        context.stroke();
    }

    drawMouseRelativePosition(context, text, x, y) {

        const padding = 1.2;

        context.beginPath();
        context.font = DEFAULT_FONT_AXIS;
        const textWidth = context.measureText(text).width;
        const height = parseInt(context.font);

        const rectWidth = textWidth * padding;
        const rectHeight = height * padding;
        context.fillStyle = '#000000';
        let xRect = x - (rectWidth / 2);
        xRect = xRect < 0 ? 0 : xRect;
        const limit = this.mouseCanvasElement.width;
        xRect = xRect + rectWidth > limit ? limit - rectWidth : xRect;
        context.fillRect(xRect, y - rectHeight, rectWidth, rectHeight);

        const offsetWidth = rectWidth - textWidth;
        const offsetheight = rectHeight - height;
        context.fillStyle = '#FFFFFF';
        let xText = xRect + (offsetWidth/2);
        context.fillText(text, xText, y - (offsetheight/2) - 2, textWidth);
        context.closePath();

    }

    initMouseEvents(canvas, { high, low , datetimes }) {
        const offsetLeft = 8;
        const offsetTop = 8;

        const context = canvas.getContext('2d');

        // init mouse move listiner
        canvas.addEventListener('mousemove', e => {
            this.eraseCanvas(canvas);
            this.drawMouseStrock(context, 0, e.pageY - offsetTop, canvas.width, e.pageY - offsetTop);
            this.drawMouseStrock(context, e.pageX - offsetLeft, 0, e.pageX - offsetLeft, canvas.height);

            // Y Axis mouse label
            const yValue = formatNumber(high - (((e.pageY - offsetTop) / canvas.height) * (high - low)));
            this.drawMouseRelativePosition(context, yValue, canvas.width, e.pageY - offsetTop);

            // X Axis mouse label
            const xValue = datetimes[floor(datetimes.length * ((e.pageX - offsetLeft) / canvas.width))];
            const x = e.pageX - offsetLeft;
            const y = canvas.height;
            this.drawMouseRelativePosition(context, xValue, x, y);

        });

        canvas.addEventListener('mouseout', e => {
            this.eraseCanvas(canvas);
        });
    }
    
}

class YAxis extends Layer {

    constructor(options) {
        super(options);
        this.canvasElement = this.createCanvas({ zIndex: LAYERS.yaxis, ...options });
    }

    render({ high, low }) {

        const canvasHeight = this.canvasElement.height;

        const context = this.canvasElement.getContext('2d');
        context.font = DEFAULT_FONT_AXIS;

        const width = context.measureText(high).width;
        this.width = width;

        const lineHeight = parseInt(context.font) * 4;
        const lines = Math.floor(canvasHeight / lineHeight);
        const diff = (high - low) / lines;

        const offsetWidth = 2;

        context.beginPath();
        context.strokeStyle = '#D3D3D3';
        context.moveTo(this.canvasElement.width - width - offsetWidth, 0);
        context.lineTo(this.canvasElement.width - width - offsetWidth, canvasHeight);
        context.stroke();

        context.fillStyle = 'rgba(255, 255, 255, 0)';
        context.fillRect(this.canvasElement.width - width, 0, width, canvasHeight);

        context.fillStyle = '#000000';
        [...Array(lines).keys()].forEach((item, index) => {
                if (index > 0) {
                    context.fillText(formatNumber(high - (index * diff)), 
                    this.canvasElement.width - width + 2, index * lineHeight, width);            
                }
            });

        context.closePath();

    }

}

class XAxis extends Layer {

    constructor(options) {
        super(options);
        this.canvasElement = this.createCanvas({ zIndex: LAYERS.yaxis, ...options });
    }

    render({ datetimes }) {

        if (!datetimes || datetimes.length == 0) {
            throw 'No datetimes found for X axis';
        }

        const canvasWidth = this.canvasElement.width;
        const canvasHeight = this.canvasElement.height;

        const context = this.canvasElement.getContext('2d');
        context.font = DEFAULT_FONT_AXIS;

        const padding = 0.2;
        const width = Math.ceil(context.measureText(datetimes[0]).width * (padding + 1));

        const lineHeight = parseInt(context.font);
        this.height = lineHeight;

        context.beginPath();
        context.fillStyle = '#000000';
        const columnWidth = canvasWidth / datetimes.length;
        let currentWidth = 0;
        let i = 0;
        let y = canvasHeight - lineHeight;
        datetimes.forEach((item, index) => {
                let x = width * i + (width * (padding/2));
                if ((columnWidth * index) > currentWidth && x + width < canvasWidth) {
                    context.fillText(item, x, y, width);      
                    currentWidth =  width * ++i;
                }
            });

        context.closePath();

    }

}

class Candlestick {

    constructor(options) {
        this.options = options ? options : {};

        if (!this.options.canvas) {
            throw 'Canvas element not defined';
        }

        if (!this.options.high) {
            throw 'High value not defined';
        }

        if (!this.options.low) {
            throw 'Low value not defined';
        }

        if (!this.options.width) {
            throw 'Width value not defined';
        }
    }

    getPoint(value, diff, canvasElement) {
        return canvasElement.height * (this.options.high - value) / diff;
    }

    render({ index, ...item }) {

        const context =  this.options.canvas.getContext('2d');
        const canvasElement = this.options.canvas;
        const diff = this.options.high - this.options.low;

        const offsetWidth = this.options.offsetWidth ? this.options.offsetWidth : DEFAULT_CANDLESTICK_OFFSET_WIDTH;

        let positve = true;
        if (item.open > item.close) {
            positve = false;
        }
        
        let y = this.getPoint(item.high, diff, canvasElement);
        let x = index * this.options.width;
        let height = canvasElement.height * (item.high - item.low) / diff;

        context.beginPath();      

        context.strokeStyle = positve ? 'green' : 'red';
        context.moveTo(floor((this.options.width / 2) + x), floor(y));
        context.lineTo(floor((this.options.width / 2) + x), floor(y + height));
        context.stroke();

        let top = item.open > item.close ? item.open : item.close;
        let bottom = item.open <= item.close ? item.open : item.close;

        y = this.getPoint(item.open > item.close ? item.open : item.close, diff, canvasElement);
        let rectWidth = this.options.width - (this.options.width * offsetWidth);
        let recHeight = canvasElement.height * (top - bottom) / diff;

        context.fillStyle = positve ? 'green' : 'red';
        context.fillRect(floor(x + (rectWidth / 2)), floor(y), floor(rectWidth), floor(recHeight));
        
        context.closePath();
    }

}










