"use strict";
const pcText = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const pcButton = (label, action, attrs = '', style = '') => `<button type="button" class="btn ${style}" data-action="${action}" ${attrs}>${label}</button>`;
const pcLabels = { prompt: '正向提示词', negative: '负向提示词' };
function pcTranslation(view, key) {
    const source = view.inputs[key], result = view.translations[key];
    if (!source.trim())
        return '<div class="pc-empty">未填写提示词</div>';
    if (!result || result.request.source_text !== source)
        return `<div class="pc-empty"><p>${result ? '原文已修改，请重新翻译。' : '尚无当前原文的译文。'}</p>${pcButton('翻译当前原文', 'comparison-translation-retry', `data-key="${key}"`, 'small')}</div>`;
    if (result.status === 'running')
        return '<div class="pc-empty" role="status"><span class="prompt-spinner"></span>正在翻译</div>';
    if (result.status === 'failed')
        return `<div class="pc-empty" role="alert"><p>${pcText(result.error ?? '翻译失败，请重试。')}</p>${pcButton('重试翻译', 'comparison-translation-retry', `data-key="${key}"`, 'small')}</div>`;
    return `<div class="pc-text pc-translated" data-pc-scroll="${key}-translation" tabindex="0">${pcText(result.text ?? '')}</div>`;
}
function pcColumn(view, generated) {
    const key = `${generated ? 'generated' : 'current'}_${view.field}`;
    const source = view.inputs[key], title = generated ? '生成结果' : '改写前';
    const editable = !view.busy && (generated ? view.hasResult : !view.hasResult);
    const original = `<textarea id="comparison-${key}" data-comparison-prompt="${key}" data-pc-scroll="${key}-original" aria-label="${title}的${pcLabels[view.field]}" spellcheck="false" ${editable ? '' : 'readonly'}>${pcText(source)}</textarea>`;
    const content = generated && !view.hasResult ? `<div class="pc-empty" role="status">${view.busy ? '<span class="prompt-spinner"></span>正在改写提示词' : view.stopped ? '改写已停止' : '填写改动意见后生成提示词'}</div>` : `<div class="pc-dual"><section><div class="pc-pane-label">原文</div>${original}</section><section><div class="pc-pane-label"><span>中文译文</span>${view.translations[key]?.status === 'succeeded' && view.translations[key]?.request.source_text === source ? pcButton('复制译文', 'pc-copy', `data-key="${key}" data-translation="true"`, 'small quiet') : ''}</div>${pcTranslation(view, key)}</section></div>`;
    return `<section class="pc-column ${generated ? 'pc-result' : ''}" aria-label="${title}"><header><div><h3>${title}</h3></div><div class="pc-column-tools">${source.trim() ? pcButton('复制原文', 'pc-copy', `data-key="${key}" aria-label="复制原文：${title}的${pcLabels[view.field]}"`, 'small quiet') : ''}</div></header><div class="pc-column-body">${content}</div><footer><span>${source.length.toLocaleString()} 字符</span>${generated && view.hasResult ? '<span>可直接编辑原文</span>' : ''}</footer></section>`;
}
function renderPromptCompare(view) {
    const status = view.busy ? '<span class="prompt-spinner"></span>正在改写' : view.error ? pcText(view.error) : view.stopped ? '改写已停止' : view.hasResult ? `第 ${view.round} 轮结果` : '';
    return `<div class="modal-backdrop pc-backdrop"><section class="modal pc-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="pc-header"><div><h2 id="modal-title">对比提示词</h2><span class="pc-model">${pcText(view.model)}</span></div>${pcButton('×', 'close-modal', 'aria-label="关闭对话框"', 'quiet pc-close')}</header><section class="pc-requirement ${view.requirementOpen ? 'is-open' : ''}"><strong>原始需求</strong><p>${pcText(view.requirement || '未填写')}</p>${pcButton(view.requirementOpen ? '收起' : '展开', 'pc-requirement', `aria-expanded="${view.requirementOpen}"`, 'small quiet')}</section><div class="pc-toolbar"><div class="pc-field-tabs" role="tablist" aria-label="提示词类型">${Object.keys(pcLabels).map(f => `<button type="button" role="tab" data-action="pc-field" data-field="${f}" aria-selected="${view.field === f}">${pcLabels[f]}</button>`).join('')}</div></div><div class="pc-main"><div class="pc-columns">${pcColumn(view, false)}${pcColumn(view, true)}</div></div><section class="pc-compose"><label for="rewrite-instruction">改动意见</label><div class="pc-compose-row"><textarea id="rewrite-instruction" aria-label="改动意见" placeholder="例如：保留人物外貌，改成平涂赛璐璐画风" ${view.busy ? 'readonly' : ''}>${pcText(view.instruction)}</textarea>${view.busy ? pcButton('停止改写', 'prompt-stop', `data-id="${pcText(view.taskId)}"`, 'pc-rewrite') : pcButton(view.hasResult ? '继续改写' : '改写提示词', 'comparison-rewrite', '', 'pc-rewrite')}</div></section><footer class="pc-footer"><div class="pc-status ${view.error ? 'pc-error' : ''}" role="${view.error ? 'alert' : 'status'}">${status}</div><div>${pcButton('关闭', 'close-modal', '', 'quiet')}${pcButton('采用正负提示词', 'prompt-adopt', view.hasResult && !view.busy ? '' : 'disabled', 'primary')}</div></footer>${view.confirmClose ? `<div class="pc-confirm"><section role="alertdialog" aria-label="保留编辑内容"><h3>生成结果有未保存的修改</h3><p>保存后可继续改写或采用。</p><div>${pcButton('继续编辑', 'pc-close-cancel', '', 'quiet')}${pcButton('放弃修改', 'pc-close-discard')}${pcButton('保存并关闭', 'pc-close-save', '', 'primary')}</div></section></div>` : ''}</section></div>`;
}
