using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace Modbus.Common
{
    /// <summary>
    /// Centralised, flat "modern" look for the WinForms UI.
    /// The theme is applied at runtime on top of the designer layout, so the
    /// designer files keep their positions and sizes untouched.
    /// </summary>
    public static class Theme
    {
        #region Palette

        public static readonly Color Background = Color.FromArgb(243, 243, 243);
        public static readonly Color Surface = Color.White;
        public static readonly Color Border = Color.FromArgb(218, 220, 224);
        public static readonly Color Text = Color.FromArgb(32, 33, 36);
        public static readonly Color TextMuted = Color.FromArgb(110, 115, 125);
        public static readonly Color TextDisabled = Color.FromArgb(160, 164, 170);

        public static readonly Color Accent = Color.FromArgb(0, 103, 192);
        public static readonly Color AccentHover = Color.FromArgb(0, 90, 170);
        public static readonly Color AccentPressed = Color.FromArgb(0, 74, 140);
        public static readonly Color AccentSoft = Color.FromArgb(232, 241, 251);

        public static readonly Color NeutralHover = Color.FromArgb(245, 246, 248);
        public static readonly Color NeutralPressed = Color.FromArgb(232, 234, 237);
        public static readonly Color DisabledFill = Color.FromArgb(240, 240, 240);

        public static readonly Color Led = Color.FromArgb(34, 197, 94);

        public static readonly Color LogBackground = Color.FromArgb(24, 26, 31);
        public static readonly Color LogText = Color.FromArgb(214, 218, 224);
        public static readonly Color LogTimestamp = Color.FromArgb(120, 126, 138);
        public static readonly Color LogTx = Color.FromArgb(96, 165, 250);
        public static readonly Color LogRx = Color.FromArgb(52, 211, 153);
        public static readonly Color LogError = Color.FromArgb(248, 113, 113);
        public static readonly Color LogSelection = Color.FromArgb(44, 48, 56);

        #endregion

        #region Fonts

        // 8.25pt keeps metrics close to the designer default font, so the
        // absolute layout of the forms is preserved.
        public static readonly Font UiFont = CreateFont(new[] { "Segoe UI" }, 8.25F, FontStyle.Regular);
        public static readonly Font CaptionFont = CreateFont(new[] { "Segoe UI Semibold", "Segoe UI" }, 8.25F, FontStyle.Regular);
        public static readonly Font MonoFont = CreateFont(new[] { "Consolas", "Cascadia Mono", "Courier New" }, 8.25F, FontStyle.Regular);
        public static readonly Font LogFont = CreateFont(new[] { "Cascadia Mono", "Consolas", "Courier New" }, 9F, FontStyle.Regular);

        private static Font CreateFont(string[] families, float size, FontStyle style)
        {
            foreach (var name in families)
            {
                var font = new Font(name, size, style, GraphicsUnit.Point);
                if (string.Equals(font.Name, name, StringComparison.OrdinalIgnoreCase))
                    return font;
                font.Dispose();
            }
            return new Font(FontFamily.GenericSansSerif, size, style, GraphicsUnit.Point);
        }

        #endregion

        private static readonly ConditionalWeakTable<Control, object> Styled = new ConditionalWeakTable<Control, object>();
        private static readonly ConditionalWeakTable<Button, object> PrimaryButtons = new ConditionalWeakTable<Button, object>();
        private static readonly object Marker = new object();

        /// <summary>Marks a button as the primary call to action (accent filled).</summary>
        public static void SetPrimary(Button button)
        {
            PrimaryButtons.Remove(button);
            PrimaryButtons.Add(button, Marker);
            if (IsStyled(button))
                UpdateButtonColors(button);
        }

        /// <summary>Applies the theme to a control and all of its children.</summary>
        public static void Apply(Control root)
        {
            if (root == null)
                return;

            if (root is Form)
            {
                root.BackColor = Background;
                root.ForeColor = Text;
            }
            else if (root is GroupBox)
            {
                StyleGroupBox((GroupBox)root);
            }
            else if (root is Button)
            {
                StyleButton((Button)root);
            }
            else if (root is TextBox)
            {
                // Keep the themed Fixed3D border: with visual styles it is a light
                // single-pixel frame, while FixedSingle draws a hard black one.
                root.Font = UiFont;
            }
            else if (root is ComboBox || root is RadioButton || root is CheckBox)
            {
                root.Font = UiFont;
                root.ForeColor = Text;
            }
            else if (root is Label)
            {
                var label = (Label)root;
                label.Font = UiFont;
                label.ForeColor = Text;
                if (label.Dock == DockStyle.None)
                    label.AutoSize = true;
            }
            else if (root is TabPage)
            {
                var page = (TabPage)root;
                page.UseVisualStyleBackColor = false;
                page.BackColor = Surface;
            }
            else if (root is UserControl)
            {
                root.BackColor = Surface;
            }

            foreach (Control child in root.Controls)
                Apply(child);
        }

        #region Group boxes (cards)

        private static void StyleGroupBox(GroupBox groupBox)
        {
            groupBox.BackColor = Surface;
            groupBox.ForeColor = Text;
            if (MarkStyled(groupBox))
            {
                EnableDoubleBuffer(groupBox);
                groupBox.Paint += PaintGroupBox;
                groupBox.EnabledChanged += (s, e) => ((Control)s).Invalidate();
            }
        }

        private static void PaintGroupBox(object sender, PaintEventArgs e)
        {
            var groupBox = (GroupBox)sender;
            var g = e.Graphics;
            var parentColor = groupBox.Parent != null ? groupBox.Parent.BackColor : Background;
            g.Clear(parentColor);
            g.SmoothingMode = SmoothingMode.AntiAlias;

            var hasCaption = !string.IsNullOrEmpty(groupBox.Text);
            var nested = groupBox.Parent is GroupBox;

            // Caption-less group box inside another card: just a thin divider.
            if (!hasCaption && nested)
            {
                using (var fill = new SolidBrush(groupBox.BackColor))
                    g.FillRectangle(fill, groupBox.ClientRectangle);
                using (var pen = new Pen(Border))
                    g.DrawLine(pen, 0, 0, groupBox.Width, 0);
                return;
            }

            var captionSize = hasCaption
                ? TextRenderer.MeasureText(g, groupBox.Text, CaptionFont, Size.Empty, TextFormatFlags.NoPadding)
                : Size.Empty;
            var top = hasCaption ? captionSize.Height / 2 : 0;
            var rect = new Rectangle(0, top, groupBox.Width - 1, groupBox.Height - top - 1);

            using (var path = RoundedRect(rect, nested ? 4 : 6))
            {
                using (var fill = new SolidBrush(groupBox.BackColor))
                    g.FillPath(fill, path);
                using (var pen = new Pen(Border))
                    g.DrawPath(pen, path);
            }

            if (hasCaption)
            {
                var captionRect = new Rectangle(8, 0, captionSize.Width + 8, captionSize.Height);
                using (var fill = new SolidBrush(groupBox.BackColor))
                    g.FillRectangle(fill, captionRect);
                var color = groupBox.Enabled ? (nested ? TextMuted : Accent) : TextDisabled;
                TextRenderer.DrawText(g, groupBox.Text, CaptionFont, new Point(captionRect.X + 4, 0), color,
                    TextFormatFlags.NoPadding);
            }
        }

        #endregion

        #region Buttons

        private static void StyleButton(Button button)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.UseVisualStyleBackColor = false;
            button.FlatAppearance.BorderSize = 1;
            button.Font = UiFont;
            button.Cursor = Cursors.Hand;
            if (MarkStyled(button))
                button.EnabledChanged += (s, e) => UpdateButtonColors((Button)s);
            UpdateButtonColors(button);
        }

        private static void UpdateButtonColors(Button button)
        {
            object dummy;
            var primary = PrimaryButtons.TryGetValue(button, out dummy);
            var appearance = button.FlatAppearance;

            if (!button.Enabled)
            {
                button.BackColor = DisabledFill;
                button.ForeColor = TextDisabled;
                appearance.BorderColor = Border;
                return;
            }

            if (primary)
            {
                button.BackColor = Accent;
                button.ForeColor = Color.White;
                appearance.BorderColor = Accent;
                appearance.MouseOverBackColor = AccentHover;
                appearance.MouseDownBackColor = AccentPressed;
            }
            else
            {
                button.BackColor = Surface;
                button.ForeColor = Text;
                appearance.BorderColor = Border;
                appearance.MouseOverBackColor = NeutralHover;
                appearance.MouseDownBackColor = NeutralPressed;
            }
        }

        #endregion

        #region Communication log

        /// <summary>
        /// Turns the log list box into a dark console with coloured TX/RX/error lines.
        /// </summary>
        public static void StyleLog(ListBox listBox)
        {
            if (!MarkStyled(listBox))
                return;
            listBox.BorderStyle = BorderStyle.None;
            listBox.BackColor = LogBackground;
            listBox.ForeColor = LogText;
            listBox.Font = LogFont;
            listBox.DrawMode = DrawMode.OwnerDrawFixed;
            listBox.ItemHeight = LogFont.Height + 4;
            listBox.IntegralHeight = false;
            listBox.DrawItem += DrawLogItem;
        }

        /// <summary>
        /// Owner-drawn list boxes do not compute the horizontal scroll range, keep it in sync.
        /// </summary>
        public static void TrackLogExtent(ListBox listBox, string line)
        {
            var width = TextRenderer.MeasureText(line, listBox.Font).Width + 12;
            if (width > listBox.HorizontalExtent)
                listBox.HorizontalExtent = width;
        }

        private static void DrawLogItem(object sender, DrawItemEventArgs e)
        {
            var listBox = (ListBox)sender;
            var selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
            using (var back = new SolidBrush(selected ? LogSelection : LogBackground))
                e.Graphics.FillRectangle(back, e.Bounds);
            if (e.Index < 0 || e.Index >= listBox.Items.Count)
                return;

            var line = Convert.ToString(listBox.Items[e.Index]);
            // Lines are formatted as ">hh:mm:ss: message"
            string time = string.Empty, message = line;
            var split = line.IndexOf(": ", StringComparison.Ordinal);
            if (line.StartsWith(">") && split > 0)
            {
                time = line.Substring(1, split - 1);
                message = line.Substring(split + 2);
            }

            const TextFormatFlags flags = TextFormatFlags.NoPadding | TextFormatFlags.VerticalCenter |
                                          TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix;
            var x = e.Bounds.X + 6;
            var bounds = new Rectangle(x, e.Bounds.Y, int.MaxValue / 2, e.Bounds.Height);
            if (time.Length > 0)
            {
                TextRenderer.DrawText(e.Graphics, time, listBox.Font, bounds, LogTimestamp, flags);
                bounds.X += TextRenderer.MeasureText(e.Graphics, time, listBox.Font, Size.Empty, flags).Width + 10;
            }
            TextRenderer.DrawText(e.Graphics, message, listBox.Font, bounds, LogColor(message), flags);
        }

        private static Color LogColor(string message)
        {
            if (message.StartsWith("TX", StringComparison.Ordinal))
                return LogTx;
            if (message.StartsWith("RX", StringComparison.Ordinal))
                return LogRx;
            if (message.IndexOf("fail", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("error", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("exception", StringComparison.OrdinalIgnoreCase) >= 0)
                return LogError;
            return LogText;
        }

        #endregion

        #region Data table cells

        public static void StyleValueBox(TextBox textBox)
        {
            textBox.Font = MonoFont;
            textBox.BackColor = Surface;
            textBox.ForeColor = Text;
        }

        public static void StyleAddressLabel(Label label)
        {
            label.Font = UiFont;
            label.ForeColor = TextMuted;
        }

        #endregion

        #region Helpers

        public static GraphicsPath RoundedRect(Rectangle rect, int radius)
        {
            var path = new GraphicsPath();
            var d = radius * 2;
            if (radius <= 0 || rect.Width < d || rect.Height < d)
            {
                path.AddRectangle(rect);
                return path;
            }
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static bool IsStyled(Control control)
        {
            object dummy;
            return Styled.TryGetValue(control, out dummy);
        }

        /// <summary>Returns true the first time a control is seen, so event handlers are hooked only once.</summary>
        private static bool MarkStyled(Control control)
        {
            if (IsStyled(control))
                return false;
            Styled.Add(control, Marker);
            return true;
        }

        private static void EnableDoubleBuffer(Control control)
        {
            var property = typeof(Control).GetProperty("DoubleBuffered", BindingFlags.Instance | BindingFlags.NonPublic);
            if (property != null)
                property.SetValue(control, true, null);
        }

        #endregion
    }
}
