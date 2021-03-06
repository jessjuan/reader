import React, { Component } from "react";
import toaster from 'toasted-notes'; // requires react-spring module! yarn add toasted-notes; npm install react-spring;
import "./application.css";
import "../../global.js";

class Applications extends Component {
  /**
   * Creates an instance of the Applications page.
   * @constructor
   */
  constructor() {
    super();
    this.state = {
      error: null,
      userDecisions: [],
      allApplications: [],
      remainingApps: [],
      comments: '',
      flag: "No",
      numYeses: null,
      votingStarted: false,
      votingComplete: false,
    }
  }
  
  /** 
   * Formats field responses
   * for multiple select questions like "Which programming languages do you know?", converts Object [a,b,c] to "a, b, c"
   * @param {Object} entry: field response to be formatted (can be string or Object[])
  */
  formatFieldResponse(entry) {
    return (typeof(entry) !== "string") ? Array.from(entry).join(", ") : entry;
  }

  /** 
   * Destructively shuffles an input array. 
   * @returns shuffled array
  */
  shuffle(array) {
    array.sort(() => Math.random() - .5);
    return array;
  }

  /** 
   * Updates state variables to reflect current Airtable state, 
   * To find all applications a reviewer has yet to vote on:
   * (1) GET from Decision Table, filter by Reviewer Name
   * (2) GET from All Applications Table
   * from (2) remove all records with matching IDs in (1)
   * @param {string} reviewerName: name of reviewer
    */
  airtableStateHandler(reviewerName) {
    const formula = "?filterByFormula=%7BReviewer%20Name%7D%20%3D%20%20%22"
    fetch(global.DECISIONS_URL + formula + reviewerName + "%22&view=Grid%20view", {
        headers: {
          Authorization: "Bearer " + global.AIRTABLE_KEY
        }
      })
        .then(res => res.json())
        .then((result) => {
          this.setState({
            userDecisions: result.records,
          });
        }, (error) => {
          this.setState({
            error,
          });
        });
    
    fetch(global.APPLICATIONS_URL + "?view=Grid%20view", {
      headers: {
        Authorization: "Bearer " + global.AIRTABLE_KEY
      }
    })
      .then(res => res.json())
      .then(
        (result) => {
          this.setState((state) => { return {
            allApplications: this.shuffle(result.records),
            numYeses: global.NUM_YES - state.userDecisions.filter(r => r.fields['Interview'] === "Yes").length,
            remainingApps: result.records.filter(r => !(state.userDecisions.map(r => r.fields['ID'])).includes(r.id)),
          }});
        },
        (error) => {
          this.setState({
            error,
          });
        }
      );
      
      this.setState({
        comments: '',
        flag: "No",
      });

      if (this.state.error) {
        return false;
      }

      return true;
  }

  /** 
   * Asynchronously submits a vote via POST and calls airtableStateHandler. 
   * @param {string} applicantName: applicant name
   * @param {string} reviewerName: name of reviewer
   * @param {string} vote: "Yes" or "No" (interview decision)
   * @param {string} flag: "Yes" or "No" (mark as flagged)
   * @param {string} comments: comments for this application
   * @param {string} id: application ID from the All Applications Table
  */
  async airtableVoteHandler(applicantName, reviewerName, vote, flag, comments, id) {
    try {
      const r = await fetch(global.DECISIONS_URL, {
        body: "{\"records\": [{\"fields\": {\"Applicant Name\": \""+applicantName+"\",\"Reviewer Name\": \""+reviewerName+"\",\"Interview\": \""+vote+"\",\"Flag\": \""+flag+"\",\"Comments\": \""+comments+"\", \"ID\": \""+id+"\"}}]}",
        headers: {
          Authorization: "Bearer " + global.AIRTABLE_KEY,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      console.log(await r.text());

      toaster.notify(<div className="toast"><h4 className="toast-text">Voted {vote} for {applicantName}!</h4></div>, {
        duration: 1000,
        position: 'bottom'
      })

      this.airtableStateHandler(reviewerName);
      document.getElementById('app-view').scrollTop = 0;
      console.log(this.state)
    }
    catch (err) {
      console.log("fetch failed [VOTE]", err);
    }
  }

  /** 
   * Displays each question and response as a new paragraph line. 
   * @param {Object} fields: question : response dict
   * @param {string} k: key in fields dict, usually the app question
   * @returns paragraph response from the app (CSS app-line)
  */
  renderAppLine(fields, k) {
    const fieldResponse = this.formatFieldResponse(fields[k]);
    if (!global.IGNORED_FIELDS.includes(k)) { // certain fields removed to eliminate app reader bias
      return (
        <div className="app-question" key={k}>
          <p className="app-field"><b>{k}</b></p>
          <p className="app-response">{fieldResponse}</p>
        </div>
      );
    }
  }

  /** 
   * OPTIONAL: Orders questions based on global.QUESTION_ORDER 
   * @param {Object} fields: question : response dict
  */
  orderFields(fields) {
    return global.QUESTION_ORDER ? global.QUESTION_ORDER.slice().map(i => Object.keys(fields)[i]) : Object.keys(fields);
  }

  /**
   * Displays the application
   * @param {dictionary} fields 
   */
  renderApp(fields) {
    const orderedFields = this.orderFields(fields);
    return orderedFields.map((k) => this.renderAppLine(fields, k));
  }

  /** 
   * Handles the event where the user comments something
   * @param {event} event: change event
  */
  handleCommentsChange(event) {
    this.setState({
      comments: event.target.value,
    });
  }

  /** 
   * Handles the event where the user checks the flag check box to flag an app
   * @param {event} event: change event 
  */
  handleFlagChange(event) {
    const flagState = event.target.checked ? "Yes" : "No";
    console.log(flagState)
    this.setState({
      flag: flagState,
    });
  }

  /** Votes "No" on the remaining apps once the user is out of yeses */
  async voteOnRemainingApps() {
    document.getElementById("leftover-no-button").disabled=true;
    if (this.state.numYeses === 0) {
      console.log("Voting 'No' on remaining apps!")
      // mark remaining apps as "No"
      const records = this.state.remainingApps.map(
        (app) => {
          let applicantName = app.fields['Name'];
          let reviewerName = this.props.reviewerName;
          let vote = "No";
          let flag = "No";
          let comments = "";
          let id = app.id;
          return "{\"fields\": {\"Applicant Name\": \""+applicantName+"\",\"Reviewer Name\": \""+reviewerName+"\",\"Interview\": \""+vote+"\",\"Flag\": \""+flag+"\",\"Comments\": \""+comments+"\", \"ID\": \""+id+"\"}}"
        }
      );

      try {
        records.map((r) =>
          fetch(global.DECISIONS_URL, {
            body: "{\"records\": ["+ r +"]}",
            headers: {
              Authorization: "Bearer " + global.AIRTABLE_KEY,
              "Content-Type": "application/json"
            },
            method: "POST"
          }));
      }
      catch (err) {
        console.log("fetch failed [VOTE]", err);
      }
    }
    this.setState({votingComplete: true}, () => {
      console.log(this.state.votingComplete, "votingComplete"); 
      toaster.notify(<div className="done-toast"><h4 className="toast-text">All done! Great work!</h4></div>, {
        position: 'bottom',
        duration: null,
      });
    });
  }

  /** Renders the voteutton if remaining apps exist */
  renderVoteRemainingButton() {
    if (this.state.remainingApps.length > 0) {
      return (
        <div>
          <h3>No Yeses Remaining</h3>
          <button className="leftover-no-button" id="leftover-no-button" onClick={() => {this.voteOnRemainingApps(); this.airtableStateHandler(this.props.reviewerName);}}>
            Vote "No" on Remaining {this.state.remainingApps.length} Apps
          </button>
        </div>
      );
    } else {
      return (
        <div>
          <h3>No Apps to Review.</h3>
          <p>Visit the Airtable to make changes</p>
        </div>
      );
    }
  }

  /** Refreshes page on start to retrieve updated state */
  initPage() {
    console.log(this.state.votingStarted, "status in startVoting");
    this.setState({votingStarted: true,});
    this.airtableStateHandler(this.props.reviewerName);
  }

  /** Sets up app reader component */
  componentDidMount() {
    this.airtableStateHandler(this.props.reviewerName);
  }

  render() {
    if (!this.state.votingStarted) {
      console.info('Initializing');
      this.initPage();
    }

    if (this.state.remainingApps.length === 0 || this.state.numYeses === 0) {
      const voteRemainingButton = this.renderVoteRemainingButton();

      return (
        <div>
          <div className="container">
            <div className="header">
              <div className="header-application">Application</div>
              <div className="header-stats">Apps Remaining: {this.state.remainingApps.length}</div>
              <div className="header-stats">Yeses Remaining: {this.state.numYeses}</div>
            </div>

            <div className="app-section">
              <div className="app-view" id="app-view"></div>
              <div className="app-options">
                <h3 className="reviewer-label">Reviewer:</h3>
                <p className="reviewer-name">{this.props.reviewerName}</p>
                <h4 className="comments-label">Comment:</h4>
                <textarea id="comments-textbox" className="comments-textbox" name="app" value={this.state.comments} disabled={true}></textarea>
                <div className="flag">
                  <input id="flag-checkbox" className="flag-checkbox" type="checkbox" checked={this.state.flag==="Yes"} disabled={true}></input>
                  <label htmlFor="flag-checkbox">Flag</label>
                </div>
                <div className="vote">
                  {voteRemainingButton}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    const current = this.state.remainingApps[0];
    const fields = current.fields;
    const id = current.id;
    const applicantName = fields["Name"];
    const reviewerName = this.props.reviewerName;
    const currentApp = this.renderApp(fields);
    return (
      <div>
        <div className="container">
          <div className="header">
            <div className="header-application">Application</div>
            <div className="header-stats">Apps Remaining: {this.state.remainingApps.length}</div>
            <div className="header-stats">Yeses Remaining: {this.state.numYeses}</div>
          </div>

          <div className="app-section">
            <div className="app-view" id="app-view">{currentApp}</div>
            <div className="app-options">
              <h3 className="reviewer-label">Reviewer:</h3>
              <p className="reviewer-name">{this.props.reviewerName}</p>
              <h4 className="comments-label">Comment:</h4>
              <textarea id="comments-textbox" className="comments-textbox" name="app" value={this.state.comments} onChange={this.handleCommentsChange.bind(this)}></textarea>
              <div className="flag">
                <input id="flag-checkbox" className="flag-checkbox" type="checkbox" checked={this.state.flag==="Yes"} onChange={this.handleFlagChange.bind(this)}></input>
                <label htmlFor="flag-checkbox">Flag</label>
              </div>
              <div className="vote">
                <h3 className="vote-label">Vote</h3>
                <button className="no-button" disabled={this.state.numYeses <= 0} onClick={() => {
                  this.airtableVoteHandler(applicantName, reviewerName, "No", this.state.flag, this.state.comments, id); window.scrollTo(0,0);}}>
                  No
                </button>
                <button className="skip-button" onClick={() => {
                  this.airtableStateHandler(reviewerName); document.getElementById('app-view').scrollTop = 0;}}>
                  Skip
                </button>
                <button className="yes-button" disabled={this.state.numYeses <= 0} onClick={() => {
                  this.airtableVoteHandler(applicantName, reviewerName, "Yes", this.state.flag, this.state.comments, id); window.scrollTo(0,0);}}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default Applications;
