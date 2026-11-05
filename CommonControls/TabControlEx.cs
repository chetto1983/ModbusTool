using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace Modbus.Common
{
    public delegate bool PreRemoveTab(int indx);

    /// <summary>
    /// Flat tab control: accent underline on the selected tab, a close glyph on the
    /// right of each tab and a "+" tab (the "..." page) to open a new view.
    /// </summary>
    public class TabControlEx : TabControl
    {
        private const string AddTabText = "...";
        private const int CloseSize = 14;
        private int _hotCloseIndex = -1;

        public TabControlEx()
            : base()
        {
            PreRemoveTabPage = null;
            DrawMode = TabDrawMode.OwnerDrawFixed;
            SizeMode = TabSizeMode.Fixed;
            ItemSize = new Size(84, 26);
        }

        public PreRemoveTab PreRemoveTabPage;

        private static bool IsAddTab(TabPage page)
        {
            return page.Text == AddTabText;
        }

        private static Rectangle CloseRect(Rectangle tab)
        {
            return new Rectangle(tab.Right - CloseSize - 6, tab.Y + (tab.Height - CloseSize) / 2, CloseSize, CloseSize);
        }

        protected override void OnDrawItem(DrawItemEventArgs e)
        {
            if (e.Index < 0 || e.Index >= TabCount)
                return;

            var g = e.Graphics;
            var page = TabPages[e.Index];
            var tab = GetTabRect(e.Index);
            var selected = e.Index == SelectedIndex;

            using (var back = new SolidBrush(selected ? Theme.Surface : Theme.Background))
                g.FillRectangle(back, tab);

            if (selected)
            {
                using (var accent = new SolidBrush(Theme.Accent))
                    g.FillRectangle(accent, tab.X, tab.Bottom - 3, tab.Width, 3);
            }

            const TextFormatFlags flags = TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine |
                                          TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis;

            if (IsAddTab(page))
            {
                TextRenderer.DrawText(g, "+", Theme.CaptionFont, tab, selected ? Theme.Accent : Theme.TextMuted,
                    flags | TextFormatFlags.HorizontalCenter);
                return;
            }

            var close = CloseRect(tab);
            var textRect = new Rectangle(tab.X + 8, tab.Y, close.X - tab.X - 10, tab.Height);
            TextRenderer.DrawText(g, page.Text, selected ? Theme.CaptionFont : Theme.UiFont, textRect,
                selected ? Theme.Text : Theme.TextMuted, flags);

            g.SmoothingMode = SmoothingMode.AntiAlias;
            if (e.Index == _hotCloseIndex)
            {
                using (var hot = new SolidBrush(Theme.NeutralPressed))
                using (var path = Theme.RoundedRect(close, 3))
                    g.FillPath(hot, path);
            }
            using (var pen = new Pen(e.Index == _hotCloseIndex ? Theme.Text : Theme.TextMuted, 1.4f))
            {
                var inset = 4;
                g.DrawLine(pen, close.Left + inset, close.Top + inset, close.Right - inset, close.Bottom - inset);
                g.DrawLine(pen, close.Right - inset, close.Top + inset, close.Left + inset, close.Bottom - inset);
            }
        }

        private int CloseHitTest(Point p)
        {
            for (int i = 0; i < TabCount; i++)
            {
                if (IsAddTab(TabPages[i]))
                    continue;
                if (CloseRect(GetTabRect(i)).Contains(p))
                    return i;
            }
            return -1;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            var hot = CloseHitTest(e.Location);
            if (hot != _hotCloseIndex)
            {
                _hotCloseIndex = hot;
                Invalidate();
            }
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            if (_hotCloseIndex != -1)
            {
                _hotCloseIndex = -1;
                Invalidate();
            }
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            base.OnMouseClick(e);
            var index = CloseHitTest(e.Location);
            if (index >= 0)
                CloseTab(index);
        }

        private void CloseTab(int i)
        {
            if (PreRemoveTabPage != null)
            {
                bool closeIt = PreRemoveTabPage(i);
                if (!closeIt)
                    return;
            }
            TabPages.Remove(TabPages[i]);
            _hotCloseIndex = -1;
        }
    }
}
