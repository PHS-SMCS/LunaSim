// engine.js
// Re-export Simulation from the DOM-free core so existing imports still work
export { Simulation } from './engineCore.js';

function showSimErrorPopup() {
    document.getElementById("simErrorPopup").style.display = "block";
    document.getElementById("grayEffectDiv").style.display = "block";
}
document.getElementById("simErrorPopupDismiss").addEventListener("click", closeSimErrorPopup);

function closeSimErrorPopup() {
    document.getElementById("simErrorPopup").style.display = "none";
    document.getElementById("grayEffectDiv").style.display = "none";
}