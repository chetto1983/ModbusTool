//! The webview's language under a C or POSIX locale, on Linux.
//!
//! With `LANG=C.UTF-8` (WSL2, containers, CI runners) WebKitGTK reports `navigator.language` as
//! "C", which is not a BCP 47 tag: uPlot builds `Intl.NumberFormat(navigator.language)` when its
//! module loads, the bundle throws, and the window stays empty. Measured on WebKitGTK 2.52.6,
//! docs/superpowers/specs/2026-11-06-linux-locale-design.md.

/// The language to give the webview when the user's first language is the C or POSIX locale,
/// which names no language; `None` keeps WebKit's own choice.
pub fn fallback_language<S: AsRef<str>>(language_names: &[S]) -> Option<&'static str> {
    let first = language_names.first()?.as_ref();
    let locale = first.split(['.', '@']).next().unwrap_or(first);
    matches!(locale, "C" | "POSIX").then_some("en-US")
}

/// Sets the main window's preferred language when the locale names none. It runs in `setup`,
/// after Tauri has started loading the page, and still reaches it (measured).
/// <https://webkitgtk.org/reference/webkit2gtk/stable/method.WebContext.set_preferred_languages.html>
#[cfg(target_os = "linux")]
pub fn apply(app: &tauri::App) -> tauri::Result<()> {
    use tauri::Manager;
    use webkit2gtk::{glib, WebContextExt, WebViewExt};

    let names = glib::language_names();
    let (Some(language), Some(window)) =
        (fallback_language(&names), app.get_webview_window("main"))
    else {
        return Ok(());
    };
    window.with_webview(move |webview| {
        if let Some(context) = webview.inner().context() {
            context.set_preferred_languages(&[language]);
        }
    })
}

#[cfg(test)]
mod tests {
    use super::fallback_language;

    #[test]
    fn the_c_and_posix_locales_get_english() {
        for names in [
            &["C.UTF-8", "C"][..],
            &["C.utf8", "C"],
            &["C"],
            &["POSIX"],
            &["C@euro", "C"],
        ] {
            assert_eq!(fallback_language(names), Some("en-US"), "{names:?}");
        }
    }

    #[test]
    fn a_named_language_is_kept() {
        for names in [
            &["it_IT.UTF-8", "it_IT", "it.UTF-8", "it", "C"][..],
            &["en_US.UTF-8", "en_US", "en", "C"],
            &["de", "en_US", "en", "C"],
            &["ca_ES.UTF-8", "ca_ES", "ca", "C"],
        ] {
            assert_eq!(fallback_language(names), None, "{names:?}");
        }
    }

    #[test]
    fn no_names_keeps_webkit_choice() {
        assert_eq!(fallback_language::<&str>(&[]), None);
    }
}
