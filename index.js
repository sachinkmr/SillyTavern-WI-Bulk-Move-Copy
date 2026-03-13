import {extension_settings} from "../../../extensions.js";
import {saveSettingsDebounced} from "../../../../script.js";
import { getFreeWorldEntryUid, loadWorldInfo, reloadEditor, saveWorldInfo, world_names, moveWorldInfoEntry, deleteWorldInfoEntry, deleteWIOriginalDataValue } from "../../../world-info.js";
import { t } from "../../../i18n.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";

// * Extension variables

const extensionName = "SillyTavern-WI-Bulk-Mover";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
    debug: false
};

const context = SillyTavern.getContext();

// * Debugs methods

const log = (...msg) => {
    if (!extensionSettings.debug) return;
    console.log("[" + extensionName + "]", ...msg);
};

// * Extension methods

/**
    Clones World Info entries from a source lorebook to a target lorebook.
    @param {string} sourceName - The name of the source lorebook file.
    @param {string} targetName - The name of the target lorebook file.
    @param {Array} sourceEntries - The entries of the source lorebook file.
    @returns {Promise<boolean>} True if the move was successful, false otherwise.
*/
async function bulkCloneWIEntries(sourceName, targetName, sourceEntries) {
    try {
        if (sourceName === targetName) throw new Error(`Target lorebook must not be the same than source`);
        if (!world_names.includes(targetName)) throw new Error(`Target lorebook '${targetName}' not found`);
        if (!sourceEntries?.length) throw new Error(`Lorebook '${sourceName}' has no entries`);

        const targetData = await loadWorldInfo(targetName);

        if (!targetData || !targetData.entries) throw new Error(`Failed to load data for target lorebook '${targetName}'`);

        log("SOURCE:", sourceEntries, "TARGET:", targetData);

        let maxDisplayIndex = Object
            .values(targetData.entries)
            .reduce((max, entry) => Math.max(max, entry.displayIndex ?? -1), -1);

        for (const entry of sourceEntries) {
            const newUid = getFreeWorldEntryUid(targetData);

            if (newUid === null) throw new Error(`Failed to get a free UID in '${targetName}'`);

            maxDisplayIndex++;
            entry.uid = newUid;
            entry.displayIndex = maxDisplayIndex;
            targetData.entries[newUid] = entry;

            log(`Copied entry from source '${sourceName}':`, entry);
        }

        await saveWorldInfo(targetName, targetData, true);

        const currentEditorBookIndex = Number($('#world_editor_select').val());

        if (!isNaN(currentEditorBookIndex)) {
            const currentEditorBookName = world_names[currentEditorBookIndex];

            if (currentEditorBookName === sourceName || currentEditorBookName === targetName)
                reloadEditor(currentEditorBookName);
        }

        // @ts-ignore
        toastr.success(t`Selected entries were copied from '${sourceName}' into '${targetName}' successfully`);

        return true;
    } catch (error) {

        // @ts-ignore
        toastr.error(t`Unexpected error: ${error.message}`);
        log('Unexpected error:', error);

        return false;
    }
}

/**
    Transfers World Info entries from a source lorebook to a target lorebook.
    @param {string} sourceName - The name of the source lorebook file.
    @param {string} targetName - The name of the target lorebook file.
    @param {Array} sourceEntries - The entries of the source lorebook file.
    @returns {Promise<boolean>} True if the move was successful, false otherwise.
*/
async function bulkTransferWIEntries(sourceName, targetName, sourceEntries) {
    try {
        if (!sourceEntries?.length) throw new Error(`Lorebook '${sourceName}' has no entries`);

        for (const entry of sourceEntries) {
            const moved = await moveWorldInfoEntry(sourceName, targetName, entry.uid);

            if (!moved) throw new Error(`Failed to move entry with uid ${entry.uid}`);
        }

        // @ts-ignore
        toastr.success(t`Selected entries were transferred from '${sourceName}' into '${targetName}' successfully`);

        return true;
    } catch (error) {

        // @ts-ignore
        toastr.error(t`Unexpected error: ${error.message}`);
        log('Unexpected error:', error);

        return false;
    }
}

/**
    Deletes multiple entries from a World Info.
    @param {String} sourceName - The name of the source lorebook file.
    @param {Array} sourceEntries - The entries of the source lorebook file.
    @returns {Promise<boolean>} True if the move was successful, false otherwise.
*/
async function bulkDeleteWIEntries(sourceName, sourceEntries) {
    try {
        if (!sourceEntries?.length) throw new Error(`Lorebook '${sourceName}' has no entries`);

        /** Create delete popup container and title. */
        const wrapper = document.createElement("div");
        const container = document.createElement("div");

        wrapper.innerHTML = t`Are you sure you want to delete the selected lorebook entries from ` + `<span style="font-weight: bold;">'${sourceName}'</span>?`;
        container.appendChild(wrapper);

        const popupConfirm = await callGenericPopup(container, POPUP_TYPE.CONFIRM, "", {
            okButton: t`Yes`,
            cancelButton: t`Cancel`,
        });

        // @ts-ignore
        if (popupConfirm !== 1) throw new Error(`Entries deletion cancelled`);

        const sourceData = await loadWorldInfo(sourceName);

        for (const entry of sourceEntries) {
            const uid = entry.uid;
            const deleted = await deleteWorldInfoEntry(sourceData, uid, { silent: true });

            if (!deleted) throw new Error(`Failed to delete entry with uid ${uid}`);

            deleteWIOriginalDataValue(sourceData, uid);
        }

        await saveWorldInfo(sourceName, sourceData, true);

        reloadEditor(sourceName);

        // @ts-ignore
        toastr.success(t`Selected entries from '${sourceName}' were deleted successfully`);

        return true;
    } catch (error) {

        // @ts-ignore
        toastr.error(t`Unexpected error: ${error.message}`);
        log('Unexpected error:', error);

        return false;
    }
}

/**
    Creates Popup for World Info
    @param {String} sourceWorld
    @param {Object} sourceWorldEntries
    @returns {Promise<Object>|null}
*/
async function createBulkMoverPopup(sourceWorld, sourceWorldEntries) {
    /** Create popup buttons. */
    const WISourceDefaultOption = document.createElement("option");
    WISourceDefaultOption.value = "";
    WISourceDefaultOption.textContent = `-- ${t`Select Target Lorebook`} --`;

    const selectWISource = document.createElement("select");
    selectWISource.classList.add("text_pole", "wide100p", "marginTop10");
    selectWISource.appendChild(WISourceDefaultOption);

    /** Give WI selector options. */
    let selectableWorldCount = 0;
    world_names.forEach(worldName => {
        if (worldName === sourceWorld) return;

        const option = document.createElement("option");
        option.value = world_names.indexOf(worldName).toString();
        option.textContent = worldName;
        selectWISource.appendChild(option);
        selectableWorldCount++;
    });

    // @ts-ignore
    if (selectableWorldCount === 0) return toastr.warning(t`There are no other lorebooks to transfer into`);

    const selectSourceEntries =  document.createElement("select");
    selectSourceEntries.classList.add("wide100p", "marginTop20", "select2_multi_sameline", "select2_choice_clickable", "select2_choice_clickable_buttonstyle");
    selectSourceEntries.name = "wibm-source-entries[]";
    selectSourceEntries.setAttribute("multiple", "multiple");

    /** Give WI entries selector options. */
    const sourceEntriesDefaultOption = { id: -1, text: t`All` };
    const entriesData = [];

    for (const key in sourceWorldEntries) {
        const entry = sourceWorldEntries[key];
        let dataName = entry.comment;

        if (dataName === "") {
            if (entry.key.length > 0) dataName = entry.key[0];
            else if (entry.content.length > 0) dataName = entry.content.slice(0, entry.content.length >= 25 ? 25 : entry.content.length).replace(/\n/g, " ") + "...";
            else dataName = "UID: " + entry.uid;
        }

        entriesData.push({ id: entry.uid, text: dataName, order: entry.displayIndex });
    }

    let selectedWorldIndex = -1;
    let selectedWorldEntries = ["-1"];

    $(selectSourceEntries).on('change', function(e) {
        const newVal = $(this).val();

        // @ts-ignore
        if (newVal.includes("-1") && !selectedWorldEntries.includes("-1")) {
            /** If selected All, remove other selections. */
            selectedWorldEntries = ["-1"];
            $(selectSourceEntries).val(selectedWorldEntries);
            $(selectSourceEntries).trigger('change');
            log("selectSourceEntries.on(change)", selectedWorldEntries);
            return
        }

        // @ts-ignore
        if (newVal.includes("-1") && newVal.length > 1) {
            /** If selected an entry, remove selection of All. */
            // @ts-ignore
            selectedWorldEntries = newVal.filter((uid) => uid !== "-1");
            $(selectSourceEntries).val(selectedWorldEntries);
            $(selectSourceEntries).trigger('change');
            log("selectSourceEntries.on(change)", selectedWorldEntries);
            return
        }

        // @ts-ignore
        selectedWorldEntries = newVal;

        log("selectSourceEntries.on(change)", selectedWorldEntries);
    });

    /** Create popup container and title. */
    const wrapper = document.createElement("div");
    const container = document.createElement("div");

    wrapper.textContent = t`Transfer "${sourceWorld}" entries into...`;
    container.id = "wibm_bulk_move_wi_container";
    container.appendChild(wrapper);
    container.appendChild(selectWISource);
    container.appendChild(selectSourceEntries);

    $(selectWISource).on("change", function() {
        selectedWorldIndex = this.value === "" ? -1 : Number(this.value);
    });

    /** Init entry selector. */
    const observer = new IntersectionObserver((entries, observer) => {
        let isVisible = false;

        for (const entry of entries) if (entry.isIntersecting) isVisible = true;
        if (!isVisible) return;

        observer.disconnect();

        // @ts-ignore
        $(selectSourceEntries).select2({
            placeholder: 'Select an option',
            data: [sourceEntriesDefaultOption, ...entriesData.sort((a, b) => a.order - b.order)],
            dropdownParent: $('dialog.popup.popup--animation-fast[open]'),
            closeOnSelect: false,
            scrollAfterSelect: false,
        });
        $(selectSourceEntries).val(selectedWorldEntries);
        $(selectSourceEntries).trigger('change');
    });

    observer.observe(container);

    return {
        popupConfirm: await callGenericPopup(container, POPUP_TYPE.CONFIRM, "", {
                okButton: t`Copy`,
                cancelButton: t`Cancel`,
                customButtons: [
                    { text: t`Delete`, classes: ['popup-button-ok'], result: 3 },
                    { text: t`Transfer`, classes: ['popup-button-ok'], result: 2 },
                ],
            }),
        selectedWorldIndex,
        selectedWorldEntries,
    };
}

// ---- Find Common Entries (Intersect) ----

/** Normalizes text for comparison: lowercase + collapse whitespace. */
function _normalizeText(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Returns a Set of lowercased, trimmed trigger keywords for an entry. */
function _getEntryKeys(entry) {
    return new Set((entry.key || []).map(k => k.trim().toLowerCase()).filter(Boolean));
}

/** Returns a Set of digit-sequences found in the entry's comment/title. */
function _getTitleDigits(entry) {
    return new Set((entry.comment || '').match(/\d+/g) || []);
}

/**
 * Word-token Dice coefficient similarity in [0, 1].
 * @param {string} a @param {string} b @returns {number}
 */
function _diceSimilarity(a, b) {
    const tokensA = a.split(/\s+/).filter(Boolean);
    const tokensB = b.split(/\s+/).filter(Boolean);
    if (!tokensA.length || !tokensB.length) return 0;
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    for (const tok of setA) if (setB.has(tok)) intersection++;
    return (2 * intersection) / (setA.size + setB.size);
}

/**
 * Finds entries in sourceEntries that have a match in compareEntries.
 * Returns one result per source entry (first match wins).
 * @param {Object} sourceEntries
 * @param {Object} compareEntries
 * @param {string} strategy - comment | keys | allkeys | digits | content | content-sim
 * @param {number} threshold - for content-sim (default 0.85)
 * @returns {{ entryA: Object, entryB: Object, score: number|null }[]}
 */
function findCommonEntries(sourceEntries, compareEntries, strategy, threshold = 0.85) {
    const arrayA = Object.values(sourceEntries);
    const arrayB = Object.values(compareEntries);
    const pairs = [];

    for (const entryA of arrayA) {
        const commentA = _normalizeText(entryA.comment);
        const keysA    = _getEntryKeys(entryA);
        const digitsA  = _getTitleDigits(entryA);
        const contentA = _normalizeText(entryA.content);

        for (const entryB of arrayB) {
            let match = false;
            let score = null;

            const commentB = _normalizeText(entryB.comment);
            const keysB    = _getEntryKeys(entryB);
            const digitsB  = _getTitleDigits(entryB);
            const contentB = _normalizeText(entryB.content);

            switch (strategy) {
                case 'comment':
                    match = Boolean(commentA) && commentA === commentB;
                    break;
                case 'keys':
                    match = keysA.size > 0 && [...keysA].some(k => keysB.has(k));
                    break;
                case 'allkeys': {
                    const smaller = keysA.size <= keysB.size ? keysA : keysB;
                    const larger  = keysA.size <= keysB.size ? keysB : keysA;
                    match = smaller.size > 0 && [...smaller].every(k => larger.has(k));
                    break;
                }
                case 'digits':
                    match = digitsA.size > 0 && [...digitsA].some(d => digitsB.has(d));
                    break;
                case 'content':
                    match = Boolean(contentA) && contentA === contentB;
                    break;
                case 'content-sim':
                    if (contentA && contentB) {
                        score = _diceSimilarity(contentA, contentB);
                        match = score >= threshold;
                    }
                    break;
            }

            if (match) pairs.push({ entryA, entryB, score });
        }
    }

    // One result per source entry (first match wins)
    const seen = new Set();
    return pairs.filter(({ entryA }) => {
        if (seen.has(entryA.uid)) return false;
        seen.add(entryA.uid);
        return true;
    });
}

/**
 * Step-1 popup: pick comparison lorebook + match strategy.
 * @param {string} sourceWorld
 * @returns {Promise<{compareName: string, strategy: string, threshold: number}|null>}
 */
async function createIntersectStepOnePopup(sourceWorld) {
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = `-- ${t`Select Lorebook to Compare`} --`;

    const compareSelect = document.createElement('select');
    compareSelect.classList.add('text_pole', 'wide100p', 'marginTop10');
    compareSelect.appendChild(defaultOpt);

    let comparableCount = 0;
    world_names.forEach((name, idx) => {
        if (name === sourceWorld) return;
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = name;
        compareSelect.appendChild(opt);
        comparableCount++;
    });

    // @ts-ignore
    if (comparableCount === 0) { toastr.warning(t`There are no other lorebooks to compare against`); return null; }

    const strategyLabel = document.createElement('label');
    strategyLabel.style.cssText = 'display:block; margin-top:12px; font-weight:bold;';
    strategyLabel.textContent = t`Match strategy`;

    const strategySelect = document.createElement('select');
    strategySelect.classList.add('text_pole', 'wide100p', 'marginTop10');

    const strategies = [
        { value: 'comment',     label: t`Comment / Title (case-insensitive)` },
        { value: 'keys',        label: t`Keywords — at least one shared` },
        { value: 'allkeys',     label: t`Keywords — all of smaller set must match` },
        { value: 'digits',      label: t`Digit sequence in title (e.g. "001")` },
        { value: 'content',     label: t`Content — exact match` },
        { value: 'content-sim', label: t`Content — fuzzy similarity` },
    ];
    for (const { value, label } of strategies) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        strategySelect.appendChild(opt);
    }

    const thresholdRow = document.createElement('div');
    thresholdRow.style.cssText = 'display:none; margin-top:10px; align-items:center; gap:10px;';
    thresholdRow.classList.add('flex-container');
    const thresholdLabel = document.createElement('span');
    thresholdLabel.textContent = t`Similarity threshold (0–1):`;
    thresholdLabel.style.flexShrink = '0';
    const thresholdInput = document.createElement('input');
    thresholdInput.type = 'number';
    thresholdInput.classList.add('text_pole');
    thresholdInput.min = '0';
    thresholdInput.max = '1';
    thresholdInput.step = '0.05';
    thresholdInput.value = '0.85';
    thresholdInput.style.width = '80px';
    thresholdRow.appendChild(thresholdLabel);
    thresholdRow.appendChild(thresholdInput);

    strategySelect.addEventListener('change', () => {
        thresholdRow.style.display = strategySelect.value === 'content-sim' ? 'flex' : 'none';
    });

    const title = document.createElement('div');
    title.innerHTML = t`Find common entries in` + ` <b>${sourceWorld}</b>`;

    const container = document.createElement('div');
    container.appendChild(title);
    container.appendChild(compareSelect);
    container.appendChild(strategyLabel);
    container.appendChild(strategySelect);
    container.appendChild(thresholdRow);

    const confirmed = await callGenericPopup(container, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Find Common`,
        cancelButton: t`Cancel`,
    });

    if (!confirmed) return null;

    const compareIdx = compareSelect.value;
    if (!compareIdx) {
        // @ts-ignore
        toastr.warning(t`Please select a lorebook to compare against`);
        return null;
    }

    return {
        compareName: world_names[Number(compareIdx)],
        strategy: strategySelect.value,
        threshold: Math.min(1, Math.max(0, Number(thresholdInput.value) || 0.85)),
    };
}

/**
 * Step-2 popup: show common entries pre-selected, pick a target lorebook.
 * @param {string} sourceWorld
 * @param {Object} sourceWorldEntries
 * @param {number[]} preSelectedUids
 * @param {string} compareWorld
 * @returns {Promise<{popupConfirm: any, selectedTargetIndex: number, selectedEntries: string[]}|null>}
 */
async function createIntersectBulkPopup(sourceWorld, sourceWorldEntries, preSelectedUids, compareWorld) {
    const targetDefaultOption = document.createElement('option');
    targetDefaultOption.value = '';
    targetDefaultOption.textContent = `-- ${t`Select Target Lorebook`} --`;

    const selectTarget = document.createElement('select');
    selectTarget.classList.add('text_pole', 'wide100p', 'marginTop10');
    selectTarget.appendChild(targetDefaultOption);

    let selectableCount = 0;
    world_names.forEach((name, idx) => {
        if (name === sourceWorld) return;
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = name;
        selectTarget.appendChild(opt);
        selectableCount++;
    });

    // @ts-ignore
    if (selectableCount === 0) { toastr.warning(t`There are no other lorebooks to transfer into`); return null; }

    const selectEntries = document.createElement('select');
    selectEntries.classList.add('wide100p', 'marginTop20', 'select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle');
    selectEntries.name = 'wibm-intersect-entries[]';
    selectEntries.setAttribute('multiple', 'multiple');

    const entriesData = [];
    for (const key in sourceWorldEntries) {
        const entry = sourceWorldEntries[key];
        let name = entry.comment;
        if (!name) {
            if (entry.key?.length) name = entry.key[0];
            else if (entry.content?.length) name = entry.content.slice(0, 25).replace(/\n/g, ' ') + '\u2026';
            else name = 'UID: ' + entry.uid;
        }
        entriesData.push({ id: entry.uid, text: name, order: entry.displayIndex ?? 0 });
    }

    let selectedEntries = preSelectedUids.map(String);
    let selectedTargetIndex = -1;

    $(selectEntries).on('change', function () {
        // @ts-ignore
        selectedEntries = $(this).val() || [];
    });

    const info = document.createElement('div');
    info.innerHTML = `<b>${preSelectedUids.length}</b> ${t`common entries found with`} <b>${compareWorld}</b>.<br>${t`Transfer into...`}`;

    const container = document.createElement('div');
    container.id = 'wibm_intersect_container';
    container.appendChild(info);
    container.appendChild(selectTarget);
    container.appendChild(selectEntries);

    $(selectTarget).on('change', function () {
        selectedTargetIndex = this.value === '' ? -1 : Number(this.value);
    });

    const observer = new IntersectionObserver((entries, obs) => {
        if (!entries.some(e => e.isIntersecting)) return;
        obs.disconnect();
        // @ts-ignore
        $(selectEntries).select2({
            placeholder: t`Select entries`,
            data: entriesData.sort((a, b) => a.order - b.order),
            dropdownParent: $('dialog.popup.popup--animation-fast[open]'),
            closeOnSelect: false,
            scrollAfterSelect: false,
        });
        $(selectEntries).val(selectedEntries);
        $(selectEntries).trigger('change');
    });
    observer.observe(container);

    return {
        popupConfirm: await callGenericPopup(container, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Copy`,
            cancelButton: t`Cancel`,
            customButtons: [
                { text: t`Delete`, classes: ['popup-button-ok'], result: 3 },
                { text: t`Transfer`, classes: ['popup-button-ok'], result: 2 },
            ],
        }),
        selectedTargetIndex,
        selectedEntries,
    };
}

/** Adds extension buttons and their listeners. */
function initFeatures() {
    $('#world_apply_current_sorting').after(`
        <div id="wibm_bulk_move_wi_entries" class="menu_button fa-solid fa-boxes-packing interactable" title="Bulk transfer lorebook entries" data-i18n="[title]Bulk transfer lorebook entries" tabindex="0">
        </div>
    `);

    // TODO: I hate this code, it's still a little bulky. FUCK JQUERY.
    $('#wibm_bulk_move_wi_entries').on('click', async function (e) {
        const currentIndex = Number($('#world_editor_select').val());
        const sourceWorld = world_names[currentIndex];
        const sourceWorldData =  await loadWorldInfo(sourceWorld);

        log("wibm_bulk_move_wi_entries.on(change)", sourceWorldData);

        // @ts-ignore
        if (!sourceWorldData) return toastr.error(t`Lorebook was not selected or does not exist`);

        const sourceWorldEntries = sourceWorldData.entries;
        const { popupConfirm, selectedWorldIndex, selectedWorldEntries } = await createBulkMoverPopup(sourceWorld, sourceWorldEntries);

        log("popupConfirm =", popupConfirm);

        if (!popupConfirm) return;
        // @ts-ignore
        if (selectedWorldIndex === -1 && popupConfirm !== 3) return toastr.warning(t`Please select a target lorebook`);
        // @ts-ignore
        if (selectedWorldEntries.length === 0) return toastr.warning(t`Please select lorebook entries`);

        const targetWorld = world_names[selectedWorldIndex];

        // @ts-ignore
        if (!targetWorld && popupConfirm !== 3) return toastr.warning(t`Target lorebook does not exist`);

        /** Filter selected entries to transfer. */
        let filteredEntries = [];
        const arraySourceWorldEntries = Object.values(sourceWorldEntries);

        log(selectedWorldEntries, !selectedWorldEntries.includes("-1"), sourceWorldEntries, arraySourceWorldEntries);

        if (!selectedWorldEntries.includes("-1")) {
            for (const key of selectedWorldEntries)
                filteredEntries.push(arraySourceWorldEntries.find((entry) => entry.uid === Number(key)));
        } else filteredEntries = [...arraySourceWorldEntries];

        filteredEntries = filteredEntries.sort((a, b) => a.displayIndex - b.displayIndex);

        log("filteredEntries =", filteredEntries);

        if (popupConfirm === 1) await bulkCloneWIEntries(sourceWorld, targetWorld, filteredEntries);
        if (popupConfirm === 2) await bulkTransferWIEntries(sourceWorld, targetWorld, filteredEntries);
        if (popupConfirm === 3) await bulkDeleteWIEntries(sourceWorld, filteredEntries);
    });

    $('#wibm_bulk_move_wi_entries').after(`
        <div id="wibm_intersect_wi_entries" class="menu_button fa-solid fa-filter interactable" title="Find &amp; move common lorebook entries" data-i18n="[title]Find &amp; move common lorebook entries" tabindex="0">
        </div>
    `);

    $('#wibm_intersect_wi_entries').on('click', async function () {
        const currentIndex = Number($('#world_editor_select').val());
        const sourceWorld = world_names[currentIndex];
        const sourceWorldData = await loadWorldInfo(sourceWorld);

        log('wibm_intersect_wi_entries.on(click)', sourceWorldData);

        // @ts-ignore
        if (!sourceWorldData) return toastr.error(t`Lorebook was not selected or does not exist`);

        // Step 1: pick comparison lorebook + strategy
        const step1 = await createIntersectStepOnePopup(sourceWorld);
        if (!step1) return;

        const { compareName, strategy, threshold } = step1;
        const compareData = await loadWorldInfo(compareName);

        // @ts-ignore
        if (!compareData?.entries) return toastr.error(t`Failed to load lorebook '${compareName}'`);

        const commonPairs = findCommonEntries(sourceWorldData.entries, compareData.entries, strategy, threshold);

        log('commonPairs =', commonPairs);

        // @ts-ignore
        if (!commonPairs.length) return toastr.warning(t`No common entries found using strategy '${strategy}'`);

        const preSelectedUids = commonPairs.map(({ entryA }) => entryA.uid);

        // Step 2: review common entries and pick a target
        const step2 = await createIntersectBulkPopup(sourceWorld, sourceWorldData.entries, preSelectedUids, compareName);
        if (!step2) return;

        const { popupConfirm, selectedTargetIndex, selectedEntries } = step2;

        if (!popupConfirm) return;
        // @ts-ignore
        if (selectedTargetIndex === -1 && popupConfirm !== 3) return toastr.warning(t`Please select a target lorebook`);
        // @ts-ignore
        if (!selectedEntries?.length) return toastr.warning(t`Please select lorebook entries`);

        const targetWorld = world_names[selectedTargetIndex];
        // @ts-ignore
        if (!targetWorld && popupConfirm !== 3) return toastr.warning(t`Target lorebook does not exist`);

        const selectedUidSet = new Set(selectedEntries.map(Number));
        const filteredEntries = Object.values(sourceWorldData.entries)
            .filter(e => selectedUidSet.has(e.uid))
            .sort((a, b) => (a.displayIndex ?? 0) - (b.displayIndex ?? 0));

        log('intersect filteredEntries =', filteredEntries);

        if (popupConfirm === 1) await bulkCloneWIEntries(sourceWorld, targetWorld, filteredEntries);
        if (popupConfirm === 2) await bulkTransferWIEntries(sourceWorld, targetWorld, filteredEntries);
        if (popupConfirm === 3) await bulkDeleteWIEntries(sourceWorld, filteredEntries);
    });
}

// * Methods in charge of controlling the extension settings

const settingsCallbacks = {
    /**	Triggers on debug setting change. */
    debug: () => {
        // Nothing by the moment
    }
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const target = event.target;
    const value = Boolean($(target).prop("checked"));
    const setting = target.getAttribute("wibm-setting");
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log("toggleSetting " + setting, value);
    saveSettingsDebounced();
}

/**	Logs setting's values. */
function displaySettings() {
    console.debug("[" + extensionName + "]", `Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
    console.debug("[" + extensionName + "]", structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadHTMLSettings() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

    $("#extensions_settings").append(settingsHtml);

    // Event Listeners for the extension HTML
    $("#wibm-activate-debug").on("input", settingsBooleanButton);
    $("#wibm-check-configuration").on("click", displaySettings);

    log("loadHTMLSettings");
}

/** Init setting values on the menu */
function setSettings() {
    $("#wibm-activate-debug").prop("checked", extensionSettings.debug).trigger("input");

    log("setSettings", extensionSettings);
}

// * Initialize Extension

(async function initExtension() {

    if (!context.extensionSettings[extensionName]) {
        context.extensionSettings[extensionName] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context.extensionSettings[extensionName][key] === undefined) {
            context.extensionSettings[extensionName][key] = defaultSettings[key];
        }
    }

    await loadHTMLSettings();
    setSettings();
    initFeatures();
})();
