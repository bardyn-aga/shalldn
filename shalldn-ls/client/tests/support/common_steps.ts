import { Given, When, Then, After, BeforeAll } from "@cucumber/cucumber";
import * as assert from 'assert';
import { runTests } from '@vscode/test-electron';
import { helpers } from './helper';
import * as vscode from 'vscode';
import Test from './test';

BeforeAll(
async function activate() {
	await helpers.activate();
})

After('@discard_changes',
async function dsicardChanges(this:Test){
	await helpers.discardChanges(this);
})

Given(/the test file named \"(.*)\" (?:with requirement id \"([\w\.]+)\"|is opened)/,
async function openFile(this:Test,fileName:string,reqId:string) {
	this.docUri = await helpers.getDocUri(fileName);
	if (!this.docUri)
		assert.fail(`File ${fileName} is not found in workspace`);
	this.thatId = reqId;
	await helpers.openDoc(this.docUri);
})

Given(/a new file with name "(.*)" is created/,
async function createFile(this:Test,filename:string) {
	filename = helpers.expandTextVariables(filename, this);
	this.docUri = await helpers.createDoc(filename);
	this.newFile = true;
})

When("the text below is appended to the end of the file",
async function enterText(this:Test, text:string){
	text = helpers.expandTextVariables(text,this);
	await helpers.enterText(text);
	await helpers.sleep(800);
})


const severities: { [id: string]: vscode.DiagnosticSeverity} = { 
	'error': vscode.DiagnosticSeverity.Error,
	'warning': vscode.DiagnosticSeverity.Warning,
	'info': vscode.DiagnosticSeverity.Information,
}
Then(/editor problems shall include (error|warning|info) (?:for the words "([^"]+)" )?with the text:/, 
async function verifyProblem(this:Test, severity:string, words:string|undefined, text:string){
	text = helpers.expandTextVariables(text, this);
	if (!this.docUri)
		assert.fail('The test step does not have a required document')
	const actualDiagnostics = vscode.languages.getDiagnostics(this.docUri);

	let problem = actualDiagnostics.find(d=>d.message==text);
	assert.notEqual(problem,undefined, `Problem not found with text "${text}"`);
	assert.equal(problem?.severity, severities[severity]??-1, `Expected "${severity}" severity of problem`);
	if (words) {
		let actual = helpers.getText(problem!.range);
		assert.equal(actual,words,"Wrong target text of the problem");
	}
})

When(/list of definitions is obtained for the word "(\w+)" in following text:/,
//{ timeout: -1 },
async function getDefinitions(this:Test,word:string,text:string){
	let range = helpers.getTextPosition(text,word);
	this.locLinks = (await vscode.commands.executeCommand(
		'vscode.executeDefinitionProvider',
		this.docUri,
		helpers.midRange(range)
	)) as Array<vscode.Location|vscode.LocationLink>;
})

Then(/the list shall contains definition in file "(.*)"/,
async function checkLocation(this:Test,file:string,text:string) {
	if (!this.locLinks)
		assert.fail('The test step does not have a list of locations')
	let fileLocations = this.locLinks.filter(l=>
		(('uri'in l)?l.uri:l.targetUri).toString().endsWith(file)
	);
	let locations: (vscode.LocationLink|vscode.Location)[]=[];
	for (let loc of fileLocations) {
		let actual = (await helpers.getDocText(loc)).trim();
		if (text == actual)
			locations.push(loc);
	}
	assert.equal(locations.length,1,`The file ${file} shall have definition "${text}"`);
})

Then("editor problems shall not include a problem with the text:",
function checkNoError(this:Test, text:string){
	text = helpers.expandTextVariables(text, this);
	if (!this.docUri)
		assert.fail('The test step does not have a required document')
	const actualDiagnostics = vscode.languages.getDiagnostics(this.docUri);

	let problem = actualDiagnostics.find(d => d.message == text);
	assert.strictEqual(problem, undefined, `Problem found with text "${text}"`);
})

When(/list of references is obtained for the word "(\w+)" in following text:/,
async function getReferences(this:Test,word:string,text:string){
	let range = helpers.getTextPosition(text,word);
	this.locLinks = (await vscode.commands.executeCommand(
		'vscode.executeReferenceProvider',
		this.docUri,
		helpers.midRange(range)
	)) as Array<vscode.Location|vscode.LocationLink>;
})

Then(/the list shall contain reference from the file "(.*)" with id "(.*)"/,
async function checkreference(this:Test,file:string,id:string) {
	if (!this.locLinks)
		assert.fail('The test step does not have a list of locations')
	let fileLocations = this.locLinks.filter(l=>
		(('uri'in l)?l.uri:l.targetUri).toString().endsWith(file)
	);
	let locations: (vscode.LocationLink|vscode.Location)[]=[];
	for (let loc of fileLocations) {
		let text = await helpers.getDocText(loc);
		if (helpers.getExtName(loc).toLowerCase() == '.shalldn') {
			let actual = text.trim().replace(/^(?:.*\n)?\*\*([\w.]+)\*\*.*$/ms, '$1');
			if (id == actual)
				locations.push(loc);
		} else {
			if (text == id)
				locations.push(loc);
		}
	}
	assert.equal(locations.length,1,`The file ${file} shall have reference with id "${id}"`);
})

When('the list of completion proposals is requested for current position',
async function requestCompletions(this:Test) {
	if (!vscode.window.activeTextEditor)
		assert.fail('No active editor ');
	if (!vscode.window.activeTextEditor.selection)
		assert.fail('No active selection in editor');
	let position = vscode.window.activeTextEditor.selection.active;
	this.complList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		this.docUri,
		position,
	)) as vscode.CompletionList;
})

Then(/the list of proposals shall (not |)include the following entries( in given order|):/,
	function checkCompletions(this: Test, not:string, checkOrder:string, text: string) {
		if (!this.complList)
			assert.fail('The test step does not have a list of completions')
		let items = text.split('\n');
		let lastIdx = -1;
		items.forEach((it,i)=>{
			let entry = this.complList!.items.find(c=>c.label == it);
			if (not)
				assert.equal(entry,undefined,`Item '${it}' was not expected in list of comletions`);
			else {
				assert.notEqual(entry,undefined,`Item '${it}' was not found in list of comletions`);
				if (checkOrder) {
					let idx = this.complList!.items.indexOf(entry!);
					assert.equal(idx > lastIdx, true, `Item '${it}' is before item ${items[lastIdx]}`);
					lastIdx = idx;
				}
			}
		})
	})

