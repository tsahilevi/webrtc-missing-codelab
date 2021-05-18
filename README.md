# Read-only repository
The github repository is archived to make it read-only. Please ask questions in the course slack channel.

# WebRTC - the missing codelab
The WebRTC samples have been a useful place to demonstrate the
best practices for WebRTC code. However, these samples have been
designed as single-page examples that did not involve a signaling
server. The conceptual step from these samples towards a real
application that involves a signaling server turns out to be pretty
steep.

The reference code here is part of a codelab that demonstrates a minimal
signaling server and its accompanying client code. nodejs and websockets
are used to implement the signaling server and the client code is "vanilla"
javascript, not using any framework.

![WebRTC: the missing codelab](https://webrtccourse.com/wp-content/uploads/2020/03/20200320.png)

# The WebRTC codelab

The WebRTC codelab itself is an online course that contains 2-3 hours of
video lessons, walking you through the code found in this reference,
explaining it in detail, making sure not to leave out the nuances of
WebRTC signaling.

The codelab also includes a set of excercises for you (along with their
coded solutions) to enhance this code further, serving as a way of a hands-on
coding project, making sure you learn by doing as well.

## Walkthrough lessons

* Introduction
* Preparation
* Run the sample
* index.html walkthrough
* Signaling 101
* Signaling 102
* Setting up STUN
* Muting and unmuting
* Screen sharing
* Hanging up
* Connection states
* Look at the statistics
* Summary

## Exercises

* Adding TURN via Twilio
* Change max bitrate
* Prompt user to answer a call
* Adding a dial button
* Buttons and call states
* Add statistics to the view
* Tracking disconnections in the server

## Learn more about the codelab

To learn more about the codelab see https://webrtccourse.com/course/webrtc-codelab

# Main files

Following are the main files you will find in this reference.

## server.js
`server.js` is the minimal implementation of the signaling server. In order
to have a self-contained example, it will also serve the client code via HTTP.
For communication between client and server websockets from the
[ws](https://www.npmjs.com/package/ws) module are used with a very simple JSON protocol ontop of it.

## index.html
The index.html file is a single file served to the clients by the signaling
server. It contains the HTML, CSS and javascript bits of the codelab.

# About the authors

### Philipp Hancke
Philipp Hancke is a long-time WebRTC developer. He is one of the few outside
contributors to the "official" WebRTC samples which have been a great way to
educate developers and promote best practices. His favorite response to
questions has been "there is a sample for that".

Philipp contributed to the W3C WebRTC specification and has been involved in
numerous WebRTC codebases which gives him great insight into which approaches
work and which don't.

In his spare time he is editing at [WebrtcH4cKS](https://webrtchacks.com/)
and comes up with creative ways to abuse the WebRTC API or find out how
others use it.

### Tsahi Levent-Levi

Tsahi Levent-Levi is an Independent Analyst and Consultant for WebRTC. Tsahi acts as the W3C Evangelist for everything WebRTC.

Tsahi Levent-Levi has over 20 years of experience in the telecommunications, VoIP and 3G industry as an engineer, manager, marketer and CTO. Tsahi is an entrepreneur, independent analyst and consultant, assisting companies to form a bridge between technologies and business strategy in the domain of telecommunications.

Tsahi is the author and editor of [BlogGeek.me](https://bloggeek.me), which focuses on the ecosystem and business opportunities around WebRTC. He is also a co-founder of Kranky Geek, a conference for WebRTC for developers, sponsored by industry leaders such as Google, Intel, TokBox, Twilio and IBM.

Tsahi is also the co-founder and CEO of [testRTC](https://testrtc.com), a company providing self-service testing and monitoring solutions for WebRTC applications.

Tsahi serves as the WebRTC Evangelist at W3C.
