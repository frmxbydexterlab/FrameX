using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace LGSFRevitAddin.Core
{
    public static class IconHelper
    {
        public static ImageSource CreateExportIcon(int size)
        {
            DrawingVisual drawingVisual = new DrawingVisual();
            using (DrawingContext drawingContext = drawingVisual.RenderOpen())
            {
                // Dark background (Pro-BIM surface color: #10131a)
                var backgroundBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10131a"));
                drawingContext.DrawRoundedRectangle(backgroundBrush, null, new Rect(0, 0, size, size), size / 8.0, size / 8.0);

                double scale = size / 32.0;

                // Export arrow pointing up (blue #007FFF)
                var arrowPen = new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#007FFF")), 3 * scale);
                arrowPen.StartLineCap = PenLineCap.Round;
                arrowPen.EndLineCap = PenLineCap.Round;
                arrowPen.LineJoin = PenLineJoin.Round;

                // Draw arrow shaft pointing UP
                drawingContext.DrawLine(arrowPen, new Point(16 * scale, 26 * scale), new Point(16 * scale, 10 * scale));
                // Draw arrowhead pointing UP
                drawingContext.DrawLine(arrowPen, new Point(10 * scale, 16 * scale), new Point(16 * scale, 10 * scale));
                drawingContext.DrawLine(arrowPen, new Point(22 * scale, 16 * scale), new Point(16 * scale, 10 * scale));

                // Draw base/top plate (white/grey #e1e2eb)
                var platePen = new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e1e2eb")), 3 * scale);
                platePen.StartLineCap = PenLineCap.Round;
                platePen.EndLineCap = PenLineCap.Round;
                drawingContext.DrawLine(platePen, new Point(8 * scale, 6 * scale), new Point(24 * scale, 6 * scale));
            }

            RenderTargetBitmap rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(drawingVisual);
            return rtb;
        }

        public static ImageSource CreateImportIcon(int size)
        {
            DrawingVisual drawingVisual = new DrawingVisual();
            using (DrawingContext drawingContext = drawingVisual.RenderOpen())
            {
                // Dark background
                var backgroundBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10131a"));
                drawingContext.DrawRoundedRectangle(backgroundBrush, null, new Rect(0, 0, size, size), size / 8.0, size / 8.0);

                double scale = size / 32.0;

                // Import arrow pointing down (green #2ecc71)
                var arrowPen = new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2ecc71")), 3 * scale);
                arrowPen.StartLineCap = PenLineCap.Round;
                arrowPen.EndLineCap = PenLineCap.Round;
                arrowPen.LineJoin = PenLineJoin.Round;

                // Draw arrow shaft pointing DOWN
                drawingContext.DrawLine(arrowPen, new Point(16 * scale, 6 * scale), new Point(16 * scale, 22 * scale));
                // Draw arrowhead pointing DOWN
                drawingContext.DrawLine(arrowPen, new Point(10 * scale, 16 * scale), new Point(16 * scale, 22 * scale));
                drawingContext.DrawLine(arrowPen, new Point(22 * scale, 16 * scale), new Point(16 * scale, 22 * scale));

                // Draw base plate (white/grey #e1e2eb)
                var platePen = new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e1e2eb")), 3 * scale);
                platePen.StartLineCap = PenLineCap.Round;
                platePen.EndLineCap = PenLineCap.Round;
                drawingContext.DrawLine(platePen, new Point(8 * scale, 26 * scale), new Point(24 * scale, 26 * scale));
            }

            RenderTargetBitmap rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(drawingVisual);
            return rtb;
        }

        public static ImageSource CreateAiIcon(int size)
        {
            DrawingVisual drawingVisual = new DrawingVisual();
            using (DrawingContext drawingContext = drawingVisual.RenderOpen())
            {
                // Dark background
                var backgroundBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10131a"));
                drawingContext.DrawRoundedRectangle(backgroundBrush, null, new Rect(0, 0, size, size), size / 8.0, size / 8.0);

                double scale = size / 32.0;

                // Inactive AI brain core design (Muted Outline and Center dot)
                var circlePen = new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#414754")), 2 * scale);
                drawingContext.DrawEllipse(null, circlePen, new Point(16 * scale, 16 * scale), 8 * scale, 8 * scale);

                var dotBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8b91a0"));
                drawingContext.DrawEllipse(dotBrush, null, new Point(16 * scale, 16 * scale), 3 * scale, 3 * scale);

                // Draw circuit nodes
                var nodePen = new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#414754")), 1.5 * scale);
                drawingContext.DrawLine(nodePen, new Point(16 * scale, 4 * scale), new Point(16 * scale, 8 * scale));
                drawingContext.DrawLine(nodePen, new Point(16 * scale, 24 * scale), new Point(16 * scale, 28 * scale));
                drawingContext.DrawLine(nodePen, new Point(4 * scale, 16 * scale), new Point(8 * scale, 16 * scale));
                drawingContext.DrawLine(nodePen, new Point(24 * scale, 16 * scale), new Point(28 * scale, 16 * scale));
            }

            RenderTargetBitmap rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(drawingVisual);
            return rtb;
        }
    }
}
