'use strict';
/** 
 * @author github.com/tintinweb
 * @license MIT
 * 
 * 
 * */
const vscode = require('vscode');
const settings = require('../settings.js');
const surya = require('surya');
const path = require('path');
const fs = require('fs');

/** views */

class BaseView {
    async refresh(value) {
        this.treeView.message = undefined;  // clear the treeview message
        return this.dataProvider.refresh(value);
    }
    async onDidSelectionChange(event) { }
}

class BaseDataProvider {
    async dataGetRoot() {
        return [];
    }

    dataGetChildren(element) {
        return null;
    }

    /** tree methods */
    getChildren(element) {
        return element ? this.dataGetChildren(element) : this.dataGetRoot();
    }

    getParent(element) {
        return element.parent;
    }

    getTreeItem(element) {
        return {
            resourceUri: element.resource,
            label: element.label,
            iconPath: element.iconPath,
            collapsibleState: element.collapsibleState,
            children: element.children,
            command: element.command || {
                command: 'solidity-va.cockpit.jumpToRange',
                arguments: [element.resource],
                title: 'JumpTo'
            }
        };
    }

    /** other methods */
    refresh() {
        return new Promise((resolve, reject) => {
            this._onDidChangeTreeData.fire();
            resolve();
        });
    }
}

/** Generic Data Provider */
/* helper */

class FilePathTreeDataProvider extends BaseDataProvider {
    constructor(listStyle, separator) {
        super();
        this.listStyle = listStyle;
        this._separator = separator || path.sep;
        this.data = [];
    }

    async dataGetRoot() {
        return this.data;
    }

    dataGetChildren(element) {
        if (!element) {
            return this.data;
        }
        // element provided? - 
        return element.children;
    }

    dataGetParent(element) {
        return element.parent;
    }

    _addPathTree(uri) {
        //strip workspace path
        let workspacePath = vscode.workspace.getWorkspaceFolder(uri).uri.fsPath;
        let pathSegments = path.relative(workspacePath, uri.fsPath).split(this._separator);
        let parent = this.data;

        for (let idx = 0; idx < pathSegments.length; idx++) {
            let name = pathSegments[idx];
            if (name == "") {
                continue;
            }
            let pathObj = parent.find(p => p.name == name);

            if (!pathObj) {
                //create a new one
                let _path = pathSegments.slice(0, idx + 1).join(this._separator);
                let _abspath = path.join(workspacePath, _path);
                let _type = FilePathTreeDataProvider.TYPE_FILE;
                try {
                    _type = fs.lstatSync(_abspath).isDirectory() ? FilePathTreeDataProvider.TYPE_DIRECTORY : FilePathTreeDataProvider.TYPE_FILE;
                } catch (err) {
                    console.warn(err);  //fallback to type file
                }

                pathObj = {
                    name: name,
                    path: _path,
                    resource: vscode.Uri.file(_abspath),
                    children: [],
                    parent: parent,
                    type: _type,
                    workspace: workspacePath,
                    collapsibleState: _type === FilePathTreeDataProvider.TYPE_DIRECTORY ? vscode.TreeItemCollapsibleState.Collapsed : 0,
                };
                parent.push(pathObj);
            }
            parent = pathObj.children;
        }
    }

    _addPathFlat(uri) {
        let pathSegments = uri.fsPath.split(this._separator);
        let workspacePath = vscode.workspace.getWorkspaceFolder(uri).uri.fsPath;
        this.data.push(
            {
                name: pathSegments[pathSegments.length - 1],
                path: uri.fsPath,
                resource: uri,
                children: [],
                parent: null,
                type: FilePathTreeDataProvider.TYPE_FILE,
                workspace: workspacePath,
                collapsibleState: 0,
            }
        );
    }

    addPath(uri) {
        if (uri.scheme === undefined) {
            uri = vscode.Uri.file(uri);
        }
        if (this.listStyle === "flat") {
            this._addPathFlat(uri);
        } else {
            this._addPathTree(uri);
        }
    }

    load(paths) {
        this.data = [];
        for (let p of paths) {
            this.addPath(p);
        }
    }
}
FilePathTreeDataProvider.TYPE_DIRECTORY = 1;
FilePathTreeDataProvider.TYPE_FILE = 2;

class VirtualPathTreeDataProvider extends FilePathTreeDataProvider {

    _addPathTree(s, metadata) {
        //strip workspace path
        let pathSegments = s.split(this._separator);
        let parent = this.data;

        for (let idx = 0; idx < pathSegments.length; idx++) {
            let name = pathSegments[idx];
            if (name == "") {
                continue;
            }
            var pathObj = parent.find(p => p.name == name);

            if (!pathObj) {
                //create a new one
                let _path = pathSegments.slice(0, idx + 1).join(this._separator);
                let _type = idx == pathSegments.length - 1 ? VirtualPathTreeDataProvider.TYPE_LEAF : VirtualPathTreeDataProvider.TYPE_NODE;
                pathObj = {
                    name: name,
                    path: _path,
                    label: name,
                    metadata: metadata,
                    resource: null,
                    children: [],
                    parent: parent,
                    type: _type,
                    collapsibleState: _type == VirtualPathTreeDataProvider.TYPE_LEAF ? 0 : vscode.TreeItemCollapsibleState.Collapsed,
                };
                parent.push(pathObj);
            }
            parent = pathObj.children;
        }
    }

    _addPathFlat(s, metadata) {
        let pathSegments = s.split(this._separator);
        this.data.push(
            {
                name: pathSegments[pathSegments.length - 1],
                path: s,
                label: s,
                metadata: metadata,
                resource: null,
                children: [],
                parent: null,
                type: VirtualPathTreeDataProvider.TYPE_LEAF,
                collapsibleState: 0,
            }
        );
    }

    addPath(s, metadata) {
        if (this.listStyle === "flat") {
            this._addPathFlat(s, metadata);
        } else {
            this._addPathTree(s, metadata);
        }
    }

    load(paths) {
        this.data = [];

        if (Array.isArray(paths)) {
            for (let p of paths) {
                this.addPath(p);
            }
        } else {
            for (let p of Object.keys(paths)) {
                this.addPath(p, paths[p]);
            }
        }

    }
}
VirtualPathTreeDataProvider.TYPE_NODE = 1;
VirtualPathTreeDataProvider.TYPE_LEAF = 2;

/* TopLevelContracts View */

class TopLevelContractsViewDataProvider extends FilePathTreeDataProvider {

    constructor(treeView) {
        super(settings.extensionConfig().cockpit.view.topLevelContracts.listStyle);
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;
    }

    async dataGetRoot() {
        return this.data || [];
    }

    /** events */

    /** tree methods */
    // inherited.

    getTreeItem(element) {
        let ret = {
            resourceUri: element.resource,
            label: element.label,
            iconPath: element.iconPath,
            collapsibleState: element.collapsibleState,
            command: element.type === FilePathTreeDataProvider.TYPE_FILE ? {
                command: 'solidity-va.cockpit.jumpToRange',
                arguments: [element.resource],
                title: 'JumpTo'
            } : 0,
        };
        return ret;
    }

    /** other methods */
    refresh(workspaceRelativeBaseDir) {
        return new Promise((resolve, reject) => {
            this.treeView.cockpit.commands._findTopLevelContracts(undefined, undefined, workspaceRelativeBaseDir).then(data => {
                this.load(Object.values(data).sort((a, b) => {
                    a = a.path.split('/').pop();
                    b = b.path.split('/').pop();
                    if (a == b) { return 0; }
                    return a < b ? -1 : 1;
                })
                );
                this._onDidChangeTreeData.fire();
                resolve();
            });
        });
    }
}


class DEPRECATED__TopLevelContractsViewDataProviderx extends BaseDataProvider {

    constructor(treeView) {
        super();
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;
    }

    async dataGetRoot() {
        if (this.data === null) {
            return [];
            await this.refresh();  //first time: get data
        }
        return Object.keys(this.data).map(k => {
            return {
                resource: this.data[k], //uri
                tooltip: k,
                name: k,
                parent: null,
                iconPath: vscode.ThemeIcon.File,
            };
        });
    }

    dataGetChildren() {
        return null; //no children :)
    }

    /** events */

    /** tree methods */
    // inherited.

    /** other methods */
    refresh() {
        return new Promise((resolve, reject) => {
            this.treeView.cockpit.commands._findTopLevelContracts().then(data => {
                this.data = data;
                this._onDidChangeTreeData.fire();
                resolve();
            });
        });
    }
}


class TopLevelContractsView extends BaseView {
    constructor(cockpit) {
        super();
        this.cockpit = cockpit;
        this.id = "topLevelContracts";
        this.dataProvider = new TopLevelContractsViewDataProvider(this);
        this.treeView = vscode.window.createTreeView(`solidity-va-cockpit-${this.id}`, { treeDataProvider: this.dataProvider });
        this.treeView.message = "click ↻ to scan for contracts...";
    }
}

/* FTrace View */

class FTraceViewDataProvider extends BaseDataProvider {

    constructor(treeView) {
        super();
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;  //json {item: {a:object, b:object, c:object}}
        this.documentUri = null;
    }

    async dataGetRoot() {
        if (this.data === null || this.documentUri === null) {
            return [];
        }
        return Object.keys(this.data).map(k => {
            let children = typeof this.data[k] === "object" ? this.data[k] : {};
            return {
                children: children,
                resource: this.documentUri, //uri
                label: k,
                tooltip: k,
                name: k,
                parent: null,
                iconPath: vscode.ThemeIcon.File,
                collapsibleState: children && Object.keys(children).length > 0 ? vscode.TreeItemCollapsibleState.Expanded : 0,
            };
        });
    }

    dataGetChildren(element) {
        if (!element) {
            return this.data;
        }

        if (!element.children) {
            return [];
        }
        // element provided? - 
        return Object.keys(element.children).map(k => {
            let children = typeof element.children[k] === "object" ? element.children[k] : {};
            return {
                children: children,
                resource: this.documentUri, //uri
                label: k,
                tooltip: k,
                name: k,
                parent: null,
                iconPath: vscode.ThemeIcon.File,
                collapsibleState: children && Object.keys(children).length > 0 ? vscode.TreeItemCollapsibleState.Expanded : 0,
            };
        });
    }


    dataGetParent(element) {
        return element.parent;
    }

    /** events */

    /** tree methods */
    // inherited.

}

class FTraceView extends BaseView {
    constructor(cockpit) {
        super();
        this.cockpit = cockpit;
        this.id = "ftrace";
        this.dataProvider = new FTraceViewDataProvider(this);
        this.treeView = vscode.window.createTreeView(`solidity-va-cockpit-${this.id}`, { treeDataProvider: this.dataProvider, showCollapseAll: true });
        this.treeView.message = "click into the editor to update view...";
    }

    async onDidSelectionChange(event) {

        let documentUri = event.textEditor._documentData._uri;
        let focus = event.selections[0].anchor;
        let commands = this.cockpit.commands;

        let contractObj = commands.g_parser.sourceUnits[documentUri.fsPath];
        let knownFiles = Object.keys(commands.g_parser.sourceUnits).filter(f => f.endsWith(".sol"));


        if (!contractObj) {
            console.warn("surya.ftrace: not a file: " + documentUri.fsPath);
            return;
        }

        let focusSolidityElement = contractObj.getFunctionAtLocation(focus.line, focus.character);
        if (!focusSolidityElement) {
            console.warn("surya.ftrace: contract not found: " + documentUri.fsPath);
            return;
        }
        let contractName = focusSolidityElement.contract._node.name;

        if (!focusSolidityElement.function) {
            return;
        }

        let functionName = focusSolidityElement.function._node.name;

        let files;
        if (settings.extensionConfig().tools.surya.input.contracts == "workspace") {
            await vscode.workspace.findFiles("**/*.sol", settings.DEFAULT_FINDFILES_EXCLUDES, 500)
                .then(uris => {
                    files = uris.map(function (uri) {
                        return uri.fsPath;
                    });
                });
        } else {
            files = [documentUri.fsPath, ...knownFiles];  //better only add imported files. need to resolve that somehow
        }

        //  contract::func, all, files 
        if (functionName === null) {
            functionName = "<Constructor>";
        } else if (functionName === "") {
            functionName = "<Fallback>";
        }

        let retj = {};
        try {
            retj = surya.ftrace(contractName + "::" + functionName, 'all', files, { jsonOutput: true }, true);
        } catch (e) {
            //console.error(e);
            retj = {"💣💥 - sorry! we've encountered an unrecoverable error :/ Please file an issue in our github repository and provide (mention codebase). thanks!":null};
        }
        this.dataProvider.documentUri = documentUri;
        this.dataProvider.data = retj;
        this.refresh();
        
    }
}

/* Methods View */


class PublicMethodsViewDataProvider extends BaseDataProvider {

    constructor(treeView) {
        super();
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;
        this.documentUri = null;
    }

    async dataGetRoot() {
        if (this.data === null || this.documentUri === null) {
            return [];
        }

        return Object.keys(this.data)
            .reduce((ret, key) => {
                let element = this.data[key];
                let range = new vscode.Range(element._node.loc.start.line, element._node.loc.start.column, element._node.loc.end.line, element._node.loc.end.column);
                let modifiers = Object.keys(element.modifiers);
                let item = {
                    resource: element.resource,
                    contextValue: element.resource.fsPath,
                    range: range,
                    label: element._node.stateMutability == "payable" ? key + " 💰 " : key,
                    tooltip: key,
                    name: key,
                    iconPath: vscode.ThemeIcon.File,
                    collapsibleState: modifiers.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : 0,
                    parent: null,
                    children: modifiers.map(name => {
                        return {
                            //resource: element.resource,
                            label: "Ⓜ  " + name,
                            //iconPath: 0,
                            command: {
                                command: 'solidity-va.cockpit.jumpToRange',
                                arguments: [element.resource, range],
                                title: 'JumpTo'
                            }
                        };
                    }),
                    command: {
                        command: 'solidity-va.cockpit.jumpToRange',
                        arguments: [element.resource, range],
                        title: 'JumpTo'
                    },
                };
                ret.push(item);
                return ret;
            }, []);
    }

    dataGetChildren(element) {
        return element.children;
    }

    /** events */

    /** tree methods */
    // inherited.

}

class PublicMethodsView extends BaseView {
    constructor(cockpit) {
        super();
        this.cockpit = cockpit;
        this.id = "publicMethods";
        this.dataProvider = new PublicMethodsViewDataProvider(this);
        this.treeView = vscode.window.createTreeView(`solidity-va-cockpit-${this.id}`, { treeDataProvider: this.dataProvider });
        this.treeView.message = "click into the editor to update view...";
    }

    async onDidSelectionChange(event) {

        let documentUri = event.textEditor._documentData._uri;
        let focus = event.selections[0].anchor;
        let commands = this.cockpit.commands;

        let contractObj = commands.g_parser.sourceUnits[documentUri.fsPath];


        if (!contractObj) {
            console.warn("cockpit.methods: not a file: " + documentUri.fsPath);
            return;
        }

        let focusSolidityElement = contractObj.getFunctionAtLocation(focus.line, focus.character);
        if (!focusSolidityElement) {
            console.warn("cockpit.methods: contract not found: " + documentUri.fsPath);
            return;
        }

        let filterNotVisibility = ["private", "internal"];
        let filterNotStateMutability = ["view", "pure", "constant"];

        let publicFunctions = Object.keys(focusSolidityElement.contract.functions)
            .filter(f => {
                let node = focusSolidityElement.contract.functions[f]._node;
                //filter only for state changing public functions
                return !filterNotVisibility.includes(node.visibility) && !filterNotStateMutability.includes(node.stateMutability);
            })
            .reduce((obj, key) => {
                let newKey = key;
                let func = focusSolidityElement.contract.functions[key];

                if (key === null || func._node.isConstructor) {
                    newKey = "<Constructor>";
                } else if (key === "" || func._node.isFallback) {
                    newKey = "<Fallback>";
                }
                func.resource = documentUri;
                obj[newKey] = func;
                return obj;
            }, {});
        //  contract::func, all, files 
        this.dataProvider.documentUri = documentUri;
        this.dataProvider.data = publicFunctions;
        this.refresh();
    }
}


/* Solidity Files View */

class ExplorerViewDataProvider extends FilePathTreeDataProvider {
    constructor(treeView) {
        super("tree");
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;
    }

    async dataGetRoot() {
        if (this.data === null) {
            this.refresh();
        }
        return this.data || [];
    }

    /** events */

    /** tree methods */
    // inherited.

    getTreeItem(element) {
        let ret = {
            resourceUri: element.resource,
            contextValue: element.resource.fsPath,
            label: element.label,
            iconPath: element.iconPath,
            collapsibleState: element.collapsibleState,
            command: element.type === FilePathTreeDataProvider.TYPE_FILE ? {
                command: 'solidity-va.cockpit.jumpToRange',
                arguments: [element.resource],
                title: 'JumpTo'
            } : 0,
        };
        return ret;
    }

    /** other methods */
    refresh() {
        return new Promise((resolve, reject) => {
            vscode.workspace.findFiles("{**/*.sol}", settings.DEFAULT_FINDFILES_EXCLUDES_ALLOWFLAT, 5000)
                .then((solfiles) => {
                    this.load(solfiles);
                    this._onDidChangeTreeData.fire();
                    resolve();
                });
        });
    }
}

class ExplorerView extends BaseView {
    constructor(cockpit) {
        super();
        this.cockpit = cockpit;
        this.id = "explorer";
        this.dataProvider = new ExplorerViewDataProvider(this);
        this.treeView = vscode.window.createTreeView(`solidity-va-cockpit-${this.id}`, { treeDataProvider: this.dataProvider, showCollapseAll: true, canSelectMany: true });
    }
}

class FlatFilesDataProvider extends FilePathTreeDataProvider {
    constructor(treeView) {
        super("tree");
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;
    }

    async dataGetRoot() {
        if (this.data === null) {
            this.refresh();
        }
        return this.data || [];
    }

    /** events */

    /** tree methods */
    // inherited.

    getTreeItem(element) {
        let ret = {
            resourceUri: element.resource,
            contextValue: element.resource.fsPath,
            label: element.label,
            iconPath: element.iconPath,
            collapsibleState: element.collapsibleState,
            command: element.type === FilePathTreeDataProvider.TYPE_FILE ? {
                command: 'solidity-va.cockpit.jumpToRange',
                arguments: [element.resource],
                title: 'JumpTo'
            } : 0,
        };
        return ret;
    }

    /** other methods */
    refresh() {
        return new Promise((resolve, reject) => {
            vscode.workspace.findFiles("{**/*_flat.sol,**/flat_*.sol}", settings.DEFAULT_FINDFILES_EXCLUDES_ALLOWFLAT, 500)
                .then((solfiles) => {
                    this.load(solfiles);
                    this._onDidChangeTreeData.fire();
                    resolve();
                });
        });
    }
}

class FlatFilesView extends BaseView {
    constructor(cockpit) {
        super();
        this.cockpit = cockpit;
        this.id = "flatFiles";
        this.dataProvider = new FlatFilesDataProvider(this);
        this.treeView = vscode.window.createTreeView(`solidity-va-cockpit-${this.id}`, { treeDataProvider: this.dataProvider, showCollapseAll: true, canSelectMany: true });
    }
}

/* settings view */
class SettingsViewDataProvider extends VirtualPathTreeDataProvider {
    constructor(treeView) {
        super("tree", ".");
        this.treeView = treeView;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.data = null;

        let pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", 'package.json')));
        let properties = pkg.contributes.configuration.properties;
        this.settings = Object.keys(properties)
            .filter(key => properties[key].type === "boolean")
            .reduce((obj, key) => {
                obj[key] = properties[key];
                return obj;
            }, {});
    }

    async dataGetRoot() {
        if (this.data === null) {
            this.refresh();
        }
        return this.data || [];
    }

    /** events */

    /** tree methods */
    // inherited.

    getTreeItem(element) {
        let ret = {
            resourceUri: element.resource,
            metadata: element.metadata,
            contextValue: element.type,
            label: element.type === VirtualPathTreeDataProvider.TYPE_LEAF ? (element.metadata.currentValue === true ? "☑  " : "☐  ") + element.label : element.label,
            //tooltip: element.type === VirtualPathTreeDataProvider.TYPE_LEAF ? element.metadata.description : null, /* fixes proposed api warning */
            iconPath: element.iconPath,
            collapsibleState: element.collapsibleState,
            command: element.type === VirtualPathTreeDataProvider.TYPE_LEAF ? {
                command: 'solidity-va.cockpit.settings.toggle',
                arguments: [element],
                title: 'Toggle'
            } : 0,
        };
        return ret;
    }

    /** other methods */
    refresh() {
        return new Promise((resolve, reject) => {
            let settingsState = Object.keys(this.settings)
                .reduce((obj, key) => {
                    obj[key] = this.settings[key];
                    let k = key.split(".");
                    obj[key].extension = k[0];
                    obj[key].section = k.slice(1).join(".");
                    obj[key].currentValue = vscode.workspace.getConfiguration(obj[key].extension).get(obj[key].section);
                    return obj;
                }, {});
            this.load(settingsState);
            this._onDidChangeTreeData.fire();
            resolve();
        });
    }
}

class SettingsView extends BaseView {
    constructor(cockpit) {
        super();
        this.cockpit = cockpit;
        this.id = "settings";
        this.dataProvider = new SettingsViewDataProvider(this);
        this.treeView = vscode.window.createTreeView(`solidity-va-cockpit-${this.id}`, { treeDataProvider: this.dataProvider, showCollapseAll: true });
    }
}

/** -- cockpit handler -- */
class Cockpit {

    constructor(commands) {
        this.commands = commands;
        this.views = {};

        this.registerView(new ExplorerView(this));
        this.registerView(new TopLevelContractsView(this));
        this.registerView(new FlatFilesView(this));
        this.registerView(new FTraceView(this));
        this.registerView(new SettingsView(this));
        this.registerView(new PublicMethodsView(this));
    }

    registerView(view) {
        this.views[view.id] = view;
    }

    async onDidSelectionChange(event) {

        if (!event || !event.textEditor || !event.textEditor.visibleRanges || event.textEditor.visibleRanges.length <= 0 || !event.selections || event.selections.length <= 0) {
            return;  // no visible range open; no selection
        }

        Object.keys(this.views).forEach(k => {
            let v = this.views[k];
            if (v.treeView.visible) {
                v.onDidSelectionChange(event);
            }
        });
    }
}


module.exports = {
    Cockpit: Cockpit
};